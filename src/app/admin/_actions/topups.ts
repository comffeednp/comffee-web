"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth/require-admin";

function bumpAll() {
  revalidatePath("/admin/topups");
  revalidatePath("/admin/today");
}

export async function fulfillTopupAction(formData: FormData) {
  const admin = await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/topups?error=missing_id");
  await supabase
    .from("member_topups")
    .update({
      fulfillment_status: "completed",
      fulfilled_at: new Date().toISOString(),
      fulfilled_by_admin_id: admin.id,
    })
    .eq("id", id);
  bumpAll();
  redirect("/admin/topups?ok=fulfilled");
}

export async function cancelTopupAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/topups?error=missing_id");
  await supabase
    .from("member_topups")
    .update({ fulfillment_status: "cancelled" })
    .eq("id", id);
  bumpAll();
  redirect("/admin/topups?ok=cancelled");
}
