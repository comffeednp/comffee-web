"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

function bumpAll(id?: string) {
  revalidatePath("/admin/internet-reservations");
  if (id) revalidatePath(`/admin/internet-reservations/${id}`);
  revalidatePath("/account");
}

export async function confirmInternetReservationAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase
    .from("internet_reservations")
    .update({ status: "confirmed", set_by_admin_id: admin.id })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/internet-reservations/${id}?ok=confirmed`);
}

export async function startTimerAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase
    .from("internet_reservations")
    .update({
      status: "active",
      actual_start: new Date().toISOString(),
      set_by_admin_id: admin.id,
    })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/internet-reservations/${id}?ok=started`);
}

export async function stopTimerAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase
    .from("internet_reservations")
    .update({ status: "completed", actual_end: new Date().toISOString() })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/internet-reservations/${id}?ok=completed`);
}

export async function extendTimerAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const minutes = parseInt(String(formData.get("minutes") ?? "0"), 10);
  if (!id || !minutes || minutes <= 0) {
    redirect(`/admin/internet-reservations/${id}?error=invalid_extend`);
  }
  // Read current value, increment
  const { data } = await supabase
    .from("internet_reservations")
    .select("time_extended_minutes")
    .eq("id", id)
    .maybeSingle();
  const current = (data?.time_extended_minutes as number) ?? 0;
  await supabase
    .from("internet_reservations")
    .update({ time_extended_minutes: current + minutes })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/internet-reservations/${id}?ok=extended_${minutes}m`);
}

export async function cancelInternetReservationAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase
    .from("internet_reservations")
    .update({ status: "cancelled" })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/internet-reservations/${id}?ok=cancelled`);
}

export async function setPrepaidAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const amount = parseFloat(String(formData.get("prepaid_php") ?? "0"));
  await supabase
    .from("internet_reservations")
    .update({ prepaid_php: Number.isNaN(amount) ? 0 : amount })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/internet-reservations/${id}?ok=paid_set`);
}
