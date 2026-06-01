/**
 * Cancel a reservation, free its dates, full-refund any payment, and email the
 * guest. Shared by the admin cancel/reject actions AND the 24h auto-reject cron
 * (so the refund + guest comms are identical no matter who triggers it).
 *
 * Refund reality: PayMongo can auto-refund CARD payments instantly, but NOT
 * GCash / QR Ph (the common PH method) — issueRefund throws QRPH_MANUAL_REQUIRED
 * for those. We catch that and drop a chat message asking the guest for their
 * GCash/bank details so the owner can transfer manually. Same behavior the
 * existing admin cancellation already relied on.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { issueRefund } from "@/lib/refunds";
import { sendCancellationEmail } from "@/lib/email";

export async function cancelReservationWithRefund(
  id: string,
  reason: string,
  adminId: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: reservation } = await supabase
    .from("reservations")
    .select("paymongo_payment_id, total_php, guest_name, guest_email, check_in, check_out, branch_id, member_id, branch:branches(name)")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("reservations").update({ status: "cancelled", notes: reason }).eq("id", id);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${id}`);

  // Refresh the public availability calendar so the freed dates reopen
  const branchId = (reservation as { branch_id?: string | null } | null)?.branch_id;
  if (branchId) {
    const { data: b } = await supabase.from("branches").select("slug").eq("id", branchId).maybeSingle();
    if (b?.slug) revalidatePath(`/branches/${b.slug}`);
  }

  // Auto-refund if payment was collected
  let okParam = "cancelled";
  const totalPhp = Number(reservation?.total_php ?? 0);
  let refundIssued = false;
  let isQrphCancel = false;
  if (reservation?.paymongo_payment_id && totalPhp > 0) {
    const { data: priorRefunds } = await supabase
      .from("refunds")
      .select("amount_php")
      .eq("reservation_id", id)
      .eq("status", "succeeded");
    const alreadyRefunded = (priorRefunds ?? []).reduce((s, r) => s + Number(r.amount_php), 0);
    const remaining = totalPhp - alreadyRefunded;
    if (remaining > 0) {
      try {
        await issueRefund({ reservationId: id, amountPhp: remaining, reason, adminId });
        okParam = "cancelled_refund_issued";
        refundIssued = true;
      } catch (e) {
        isQrphCancel = e instanceof Error && e.message === "QRPH_MANUAL_REQUIRED";
        okParam = isQrphCancel ? "cancelled_refund_qrph" : "cancelled_refund_failed";
      }
    }
  }

  // Guest cancellation email
  const guestEmail = (reservation as { guest_email?: string | null } | null)?.guest_email;
  const guestName = (reservation as { guest_name?: string | null } | null)?.guest_name;
  const checkIn = (reservation as { check_in?: string | null } | null)?.check_in;
  const checkOut = (reservation as { check_out?: string | null } | null)?.check_out;
  const branchRow = (reservation as { branch?: { name: string } | null } | null)?.branch;
  const branchName = Array.isArray(branchRow) ? branchRow[0]?.name : branchRow?.name;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  if (guestEmail && guestName && checkIn && checkOut && branchName) {
    sendCancellationEmail({
      guestEmail, guestName, branchName, checkIn, checkOut,
      totalPhp, refundIssued, reservationId: id, chatUrl: `${siteUrl}`,
    }).catch(() => {});
  }

  // QR Ph / GCash → can't auto-refund; ask for transfer details in chat
  if (isQrphCancel) {
    const memberId = (reservation as { member_id?: string | null } | null)?.member_id;
    if (memberId) {
      const { data: conv } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("member_id", memberId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conv) {
        await supabase.from("chat_messages").insert({
          conversation_id: conv.id,
          sender_type: "system",
          body: `Your booking has been cancelled. Since you paid via QR Ph / GCash, we can't refund automatically. Please reply with your GCash number or bank details (bank name, account number, account name) and we'll process the ₱${totalPhp.toLocaleString("en-PH")} transfer manually.`,
        });
        await supabase
          .from("chat_conversations")
          .update({ last_message_at: new Date().toISOString(), status: "open" })
          .eq("id", conv.id);
      }
    }
  }

  return okParam;
}
