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
import { splitRefund } from "@/lib/booking-pricing";
import { sendCancellationEmail } from "@/lib/email";

export async function cancelReservationWithRefund(
  id: string,
  reason: string,
  adminId: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: reservation } = await supabase
    .from("reservations")
    .select("paymongo_payment_id, total_php, payment_type, balance_php, balance_paid_at, balance_paymongo_payment_id, guest_name, guest_email, check_in, check_out, branch_id, member_id, branch:branches(name)")
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

  // Auto-refund any payments we collected. A 30% booking can carry TWO PayMongo
  // payments — the initial reservation fee + deposit (total_php), and the 70%
  // balance (balance_php) once settled. Each lives on its own payment id and must
  // be refunded separately, or this full-refund would silently short the guest
  // the entire balance they already paid.
  const res = reservation as {
    paymongo_payment_id?: string | null;
    total_php?: number | null;
    payment_type?: string | null;
    balance_php?: number | null;
    balance_paid_at?: string | null;
    balance_paymongo_payment_id?: string | null;
  } | null;
  const initialPaid = Number(res?.total_php ?? 0);
  const balancePaid =
    res?.payment_type === "partial" && res?.balance_paid_at && res?.balance_paymongo_payment_id
      ? Number(res?.balance_php ?? 0)
      : 0;
  const paidTotal = initialPaid + balancePaid;

  // Idempotency on a re-run: treat money already refunded as covering the
  // initial payment first, then the balance.
  const { data: priorRefunds } = await supabase
    .from("refunds")
    .select("amount_php")
    .eq("reservation_id", id)
    .eq("status", "succeeded");
  const alreadyRefunded = (priorRefunds ?? []).reduce((s, x) => s + Number(x.amount_php), 0);
  const { refundInitial, refundBalance } = splitRefund({ initialPaid, balancePaid, alreadyRefunded });

  let okParam = "cancelled";
  let refundIssued = false;
  let refundFailed = false;
  let qrphManualPhp = 0;

  const tryRefund = async (amountPhp: number, source: "initial" | "balance") => {
    if (amountPhp <= 0) return;
    try {
      await issueRefund({ reservationId: id, amountPhp, paymentSource: source, reason, adminId });
      refundIssued = true;
    } catch (e) {
      if (e instanceof Error && e.message === "QRPH_MANUAL_REQUIRED") {
        qrphManualPhp += amountPhp;
      } else {
        refundFailed = true;
      }
    }
  };

  if (res?.paymongo_payment_id) await tryRefund(refundInitial, "initial");
  if (res?.balance_paymongo_payment_id) await tryRefund(refundBalance, "balance");

  const isQrphCancel = qrphManualPhp > 0;
  if (isQrphCancel) okParam = "cancelled_refund_qrph";
  else if (refundFailed) okParam = "cancelled_refund_failed";
  else if (refundIssued) okParam = "cancelled_refund_issued";

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
      totalPhp: paidTotal, refundIssued, reservationId: id, chatUrl: `${siteUrl}`,
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
          body: `Your booking has been cancelled. Since you paid via QR Ph / GCash, we can't refund automatically. Please reply with your GCash number or bank details (bank name, account number, account name) and we'll process the ₱${qrphManualPhp.toLocaleString("en-PH")} transfer manually.`,
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
