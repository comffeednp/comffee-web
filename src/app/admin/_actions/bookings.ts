"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireEditor } from "@/lib/auth/require-admin";
import { issueRefund } from "@/lib/refunds";
import { sendCancellationEmail } from "@/lib/email";

function bumpAll(id?: string) {
  revalidatePath("/admin/bookings");
  if (id) revalidatePath(`/admin/bookings/${id}`);
}

export async function manualConfirmAction(formData: FormData) {
  await requireEditor();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") ?? "");
  await supabase
    .from("reservations")
    .update({ status: "confirmed", hold_expires_at: null })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/bookings/${id}?ok=confirmed`);
}

export async function cancelBookingAction(formData: FormData) {
  const admin = await requireEditor();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "cancelled by admin");

  // Fetch full reservation details before cancelling
  const { data: reservation } = await supabase
    .from("reservations")
    .select("paymongo_payment_id, total_php, payment_type, balance_php, balance_paid_at, balance_paymongo_payment_id, guest_name, guest_email, check_in, check_out, branch_id, branch:branches(name)")
    .eq("id", id)
    .maybeSingle();

  await supabase
    .from("reservations")
    .update({ status: "cancelled", notes: reason })
    .eq("id", id);
  bumpAll(id);

  // Auto-refund any payments we collected. A 30% booking can carry TWO PayMongo
  // payments — the initial reservation fee + deposit (total_php), and the 70%
  // balance (balance_php) once settled. Each lives on its own payment id and must
  // be refunded separately, or a Comffee-initiated cancellation would silently
  // short the guest the entire balance they already paid.
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

  // Idempotency on an accidental second cancel: treat money already refunded as
  // covering the initial payment first, then the balance.
  const { data: priorRefunds } = await supabase
    .from("refunds")
    .select("amount_php")
    .eq("reservation_id", id)
    .eq("status", "succeeded");
  const alreadyRefunded = (priorRefunds ?? []).reduce((s, x) => s + Number(x.amount_php), 0);
  const refundInitial = Math.max(0, initialPaid - Math.min(alreadyRefunded, initialPaid));
  const refundBalance = Math.max(0, balancePaid - Math.max(0, alreadyRefunded - initialPaid));

  let okParam = "cancelled";
  let refundIssued = false;
  let refundFailed = false;
  let qrphManualPhp = 0;

  const tryRefund = async (amountPhp: number, source: "initial" | "balance") => {
    if (amountPhp <= 0) return;
    try {
      await issueRefund({
        reservationId: id,
        amountPhp,
        paymentSource: source,
        reason: "Admin-initiated cancellation",
        adminId: admin.id,
      });
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

  // Send cancellation email to guest if email on file
  const guestEmail = (reservation as { guest_email?: string | null } | null)?.guest_email;
  const guestName = (reservation as { guest_name?: string | null } | null)?.guest_name;
  const checkIn = (reservation as { check_in?: string | null } | null)?.check_in;
  const checkOut = (reservation as { check_out?: string | null } | null)?.check_out;
  const branchRow = (reservation as { branch?: { name: string } | null } | null)?.branch;
  const branchName = Array.isArray(branchRow) ? branchRow[0]?.name : branchRow?.name;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  if (guestEmail && guestName && checkIn && checkOut && branchName) {
    sendCancellationEmail({
      guestEmail,
      guestName,
      branchName,
      checkIn,
      checkOut,
      totalPhp: paidTotal,
      refundIssued,
      reservationId: id,
      chatUrl: `${siteUrl}`,
    }).catch(() => {});
  }

  // If QR Ph refund can't be processed automatically, post a chat message asking for bank details
  if (isQrphCancel) {
    const { data: resRow } = await supabase
      .from("reservations")
      .select("member_id")
      .eq("id", id)
      .maybeSingle();
    const memberId = (resRow as { member_id?: string | null } | null)?.member_id;
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

  redirect(`/admin/bookings/${id}?ok=${okParam}`);
}

export async function manualBlockAction(formData: FormData) {
  await requireEditor();
  const supabase = getSupabaseAdmin();
  const branch_id = String(formData.get("branch_id") ?? "");
  const check_in = String(formData.get("check_in") ?? "");
  const check_out = String(formData.get("check_out") ?? "");
  const notes = String(formData.get("notes") ?? "manual block");

  if (!branch_id || !check_in || !check_out) {
    redirect("/admin/bookings?error=missing_fields");
  }

  const { error } = await supabase.from("reservations").insert({
    branch_id,
    source: "manual_block",
    status: "confirmed",
    check_in,
    check_out,
    guest_name: "Manual block",
    notes,
  });
  if (error) {
    // The overlap constraint returns a raw Postgres message — show something readable.
    const overlap =
      error.message.includes("reservations_no_overlap") || error.code === "23P01";
    const friendly = overlap
      ? "Those dates overlap an existing booking or block"
      : error.message;
    redirect(`/admin/bookings?error=${encodeURIComponent(friendly)}`);
  }
  bumpAll();
  redirect("/admin/bookings");
}
