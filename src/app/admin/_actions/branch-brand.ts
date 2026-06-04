"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth/require-admin";

// Brand grouping for partner cafes. This is a STANDALONE action (not part of updateBranchAction)
// because partner_cafe branches are view+approve-only in the admin — their public look is edited on
// the POS. But `brand` is a website-listing concern the owner sets directly here: branches that
// share a non-null brand collapse into one card on /partners (migration 0051). Updates ONLY brand.
export async function updateBranchBrandAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/branches?error=missing_id");

  const raw = String(formData.get("brand") ?? "").trim();
  const brand = raw.length === 0 ? null : raw;

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("branches").update({ brand }).eq("id", id);
  if (error) {
    redirect(`/admin/branches/${id}?error=${encodeURIComponent(error.message)}`);
  }
  // Brand drives grouping on the public Partner Cafes page — refresh it too.
  revalidatePath(`/admin/branches/${id}`);
  revalidatePath("/partners");
  redirect(`/admin/branches/${id}?ok=1`);
}
