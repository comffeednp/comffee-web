"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth/require-admin";

function bumpAll(id?: string) {
  revalidatePath("/admin/pc-reservations");
  if (id) revalidatePath(`/admin/pc-reservations/${id}`);
  revalidatePath("/admin/today");
}

export async function honorPCReservationAction(formData: FormData) {
  const admin = await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/pc-reservations?error=missing_id");
  await supabase
    .from("pc_reservations")
    .update({
      status: "honored",
      honored_at: new Date().toISOString(),
      honored_by_admin_id: admin.id,
    })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/pc-reservations/${id}?ok=honored`);
}

export async function cancelPCReservationAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/pc-reservations?error=missing_id");
  await supabase
    .from("pc_reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/pc-reservations/${id}?ok=cancelled`);
}

export async function expirePCReservationAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/pc-reservations?error=missing_id");
  await supabase
    .from("pc_reservations")
    .update({ status: "expired" })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/pc-reservations/${id}?ok=expired`);
}
