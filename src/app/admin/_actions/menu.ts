"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { slugify } from "@/lib/utils";

function nullable(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function bumpAll() {
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

/* ---------- categories ---------- */
export async function addCategoryAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/menu?error=name_required");
  await supabase.from("menu_categories").insert({
    name,
    slug: slugify(name),
    sort_order: numOrNull(formData.get("sort_order")) ?? 0,
  });
  bumpAll();
  redirect("/admin/menu");
}

export async function deleteCategoryAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase.from("menu_categories").delete().eq("id", id);
  bumpAll();
  redirect("/admin/menu");
}

/* ---------- items ---------- */
export async function addItemAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const name = String(formData.get("name") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "");
  if (!name || !category_id) redirect("/admin/menu?error=missing_fields");
  await supabase.from("menu_items").insert({
    name,
    category_id,
    description: nullable(formData.get("description")),
    base_price_php: numOrNull(formData.get("base_price_php")) ?? 0,
    is_global: true,
    available: true,
    sort_order: numOrNull(formData.get("sort_order")) ?? 0,
  });
  bumpAll();
  redirect("/admin/menu");
}

export async function deleteItemAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase.from("menu_items").delete().eq("id", id);
  bumpAll();
  redirect("/admin/menu");
}

export async function toggleItemAvailableAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  await supabase.from("menu_items").update({ available: next }).eq("id", id);
  bumpAll();
  redirect("/admin/menu");
}
