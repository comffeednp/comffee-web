"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function setPCTierAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const tier = String(formData.get("pc_tier") ?? "");

  if (!id || !branchId) {
    redirect(`/admin/branches/${branchId || ""}?error=missing_id`);
  }

  const validTier =
    tier === "regular" || tier === "vip" ? tier : null;

  await supabase
    .from("pc_stations")
    .update({ pc_tier: validTier })
    .eq("id", id);

  revalidatePath(`/admin/branches/${branchId}`);
  revalidatePath(`/branches`);
  redirect(`/admin/branches/${branchId}?ok=tier_saved#pc-stations`);
}
