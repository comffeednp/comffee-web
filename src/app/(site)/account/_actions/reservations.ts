"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth/require-member";
import { sendCancellationEmail } from "@/lib/email";

export async function requestInternetReservationAction(formData: FormData) {
  const member = await requireMember();
  const branch_id = String(formData.get("branch_id") ?? "");
  const station_label = String(formData.get("station_label") ?? "").trim();
  const requested_start = String(formData.get("requested_start") ?? "");
  const requested_end = String(formData.get("requested_end") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!branch_id || !station_label || !requested_start || !requested_end) {
    redirect("/account/reservations/new?error=missing_fields");
  }

  const start = new Date(requested_start);
  const end = new Date(requested_end);
  if (end <= start) {
    redirect("/account/reservations/new?error=invalid_time_range");
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("internet_reservations").insert({
    member_id: member.id,
    branch_id,
    station_label,
    requested_start: start.toISOString(),
    requested_end: end.toISOString(),
    status: "requested",
    notes,
  });
  if (error) {
    redirect(`/account/reservations/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/account");
  revalidatePath("/admin/internet-reservations");
  redirect("/account?ok=reservation_submitted");
}

export async function cancelMyPlaycationAction(formData: FormData) {
  const member = await requireMember();
  const id = String(formData.get("id") ?? "");
  const admin = getSupabaseAdmin();

  const { data: reservation } = await admin
    .from("reservations")
    .select("id, check_in, check_out, status, total_php, branch:branches(name)")
    .eq("id", id)
    .eq("member_id", member.id)
    .in("status", ["pending_hold", "confirmed"])
    .maybeSingle();

  if (!reservation) redirect("/account?error=not_found");

  await admin.from("reservations").update({ status: "cancelled" }).eq("id", id);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  const branch = reservation.branch as unknown as { name: string } | null;
  if (member.email) {
    sendCancellationEmail({
      guestEmail: member.email,
      guestName: member.full_name,
      branchName: branch?.name ?? "Comffee Playcation",
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
      totalPhp: reservation.total_php ?? 0,
      refundIssued: false,
      reservationId: id,
      chatUrl: `${siteUrl}/account`,
    }).catch(() => {});
  }

  revalidatePath("/account");
  revalidatePath("/admin/reservations");
  redirect("/account?ok=booking_cancelled");
}

export async function cancelMyReservationAction(formData: FormData) {
  const member = await requireMember();
  const id = String(formData.get("id") ?? "");
  const admin = getSupabaseAdmin();
  // Only allow cancelling own reservations
  await admin
    .from("internet_reservations")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("member_id", member.id);
  revalidatePath("/account");
  revalidatePath("/admin/internet-reservations");
  redirect("/account?ok=cancelled");
}
