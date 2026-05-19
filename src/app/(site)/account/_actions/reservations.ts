"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth/require-member";

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
