"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAirbnbSync } from "@/lib/airbnb-sync";

export async function addAirbnbCalendarAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const branch_id = String(formData.get("branch_id") ?? "");
  const ical_url = String(formData.get("ical_url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || null;
  if (!branch_id || !ical_url) {
    redirect("/admin/airbnb-calendars?error=missing_fields");
  }
  const { error } = await supabase
    .from("airbnb_calendars")
    .insert({ branch_id, ical_url, label });
  if (error) {
    redirect(`/admin/airbnb-calendars?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin/airbnb-calendars");
  redirect("/admin/airbnb-calendars?ok=added");
}

export async function deleteAirbnbCalendarAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase.from("airbnb_calendars").delete().eq("id", id);
  revalidatePath("/admin/airbnb-calendars");
  redirect("/admin/airbnb-calendars");
}

export async function syncNowAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "") || undefined;
  let result;
  try {
    result = await runAirbnbSync(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    redirect(`/admin/airbnb-calendars?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/admin/airbnb-calendars");
  if (!result.ok) {
    redirect(`/admin/airbnb-calendars?error=${encodeURIComponent(result.error ?? "sync_failed")}`);
  }
  redirect(`/admin/airbnb-calendars?ok=synced`);
}
