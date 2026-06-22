"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireEditor } from "@/lib/auth/require-admin";
import { acceptReservation, getReservationById } from "@/lib/reservations";
import {
  sendReservationConfirmationEmail,
  postBookingConfirmedChat,
  type ConfirmableReservation,
} from "@/lib/booking-confirm";
import { cancelReservationWithRefund } from "@/lib/booking-cancel";

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
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "cancelled by admin");
  const okParam = await cancelReservationWithRefund(id, reason, admin.id);
  redirect(`/admin/bookings/${id}?ok=${okParam}`);
}

/**
 * Reject (decline) a waiting request-to-book. Same cancel+refund path as an
 * admin cancellation — the guest is fully refunded (card instant, GCash manual)
 * and the dates reopen. Reuses the cancellation ok= codes so the bookings page
 * shows the right refund message.
 */
export async function rejectBookingAction(formData: FormData) {
  const admin = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "Booking request declined by host");
  const okParam = await cancelReservationWithRefund(id, reason, admin.id);
  redirect(`/admin/bookings/${id}?ok=${okParam}`);
}

/**
 * Accept (approve) a waiting request-to-book → confirmed, and NOW fire the
 * "you're booked" confirmation email (it no longer fires at payment time). The
 * acceptReservation guard makes this a no-op if the request was already handled
 * (accepted before, or auto-rejected by the 24h sweep).
 */
export async function approveBookingAction(formData: FormData) {
  await requireEditor();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") ?? "");

  const flipped = await acceptReservation(id);
  bumpAll(id);
  if (!flipped) {
    redirect(`/admin/bookings/${id}?ok=already_handled`);
  }

  const { data: r } = await supabase
    .from("reservations")
    .select("id, branch_id, member_id, guest_email, guest_name, guest_phone, num_guests, total_php, check_in, check_out")
    .eq("id", id)
    .maybeSingle();

  if (r?.branch_id) {
    const { data: b } = await supabase.from("branches").select("slug").eq("id", r.branch_id).maybeSingle();
    if (b?.slug) revalidatePath(`/branches/${b.slug}`);
    // Tell the guest, same as the webhook would: branded email + in-app chat.
    await sendReservationConfirmationEmail(r as ConfirmableReservation);
    await postBookingConfirmedChat(r as ConfirmableReservation);
  }

  redirect(`/admin/bookings/${id}?ok=confirmed`);
}

/**
 * Manually (re)send a confirmed booking's confirmation — the branded email plus
 * the in-app chat note. Used when a webhook was missed or a guest says they
 * never got the email. No-op-safe: only confirmed bookings, best-effort sends.
 */
export async function resendConfirmationAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  const reservation = await getReservationById(id);
  if (!reservation || reservation.status !== "confirmed") {
    redirect(`/admin/bookings/${id}?error=${encodeURIComponent("Only confirmed bookings can be resent")}`);
  }
  await sendReservationConfirmationEmail(reservation as ConfirmableReservation);
  await postBookingConfirmedChat(reservation as ConfirmableReservation);
  bumpAll(id);
  redirect(`/admin/bookings/${id}?ok=confirmation_resent`);
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
