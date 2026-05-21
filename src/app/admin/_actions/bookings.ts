"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { issueRefund } from "@/lib/refunds";
import { sendCancellationEmail } from "@/lib/email";

function bumpAll(id?: string) {
  revalidatePath("/admin/bookings");
  if (id) revalidatePath(`/admin/bookings/${id}`);
}

export async function manualConfirmAction(formData: FormData) {
  await requireAdmin();
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
  const admin = await requireAdmin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "cancelled by admin");

  // Fetch full reservation details before cancelling
  const { data: reservation } = await supabase
    .from("reservations")
    .select("paymongo_payment_id, total_php, guest_name, guest_email, check_in, check_out, branch_id, branch:branches(name)")
    .eq("id", id)
    .maybeSingle();

  await supabase
    .from("reservations")
    .update({ status: "cancelled", notes: reason })
    .eq("id", id);
  bumpAll(id);

  // Auto-refund if payment was collected
  let okParam = "cancelled";
  const totalPhp = Number(reservation?.total_php ?? 0);
  let refundIssued = false;
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
        await issueRefund({
          reservationId: id,
          amountPhp: remaining,
          reason: "Admin-initiated cancellation",
          adminId: admin.id,
        });
        okParam = "cancelled_refund_issued";
        refundIssued = true;
      } catch {
        okParam = "cancelled_refund_failed";
      }
    }
  }

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
      totalPhp,
      refundIssued,
      reservationId: id,
      chatUrl: `${siteUrl}`,
    }).catch(() => {});
  }

  redirect(`/admin/bookings/${id}?ok=${okParam}`);
}

export async function manualBlockAction(formData: FormData) {
  await requireAdmin();
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
    redirect(`/admin/bookings?error=${encodeURIComponent(error.message)}`);
  }
  bumpAll();
  redirect("/admin/bookings");
}
