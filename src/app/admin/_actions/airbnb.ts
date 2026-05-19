"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

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
  const id = String(formData.get("id") ?? "");
  // Trigger the cron endpoint with the secret if set
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const secret = process.env.CRON_SECRET ?? "";
  try {
    await fetch(`${base}/api/cron/sync-airbnb${secret ? `?secret=${secret}` : ""}`, {
      cache: "no-store",
    });
  } catch (e) {
    console.error("manual sync failed", e);
  }
  revalidatePath("/admin/airbnb-calendars");
  redirect(`/admin/airbnb-calendars?ok=synced${id ? `_${id.slice(0, 6)}` : ""}`);
}
