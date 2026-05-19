"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

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
function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}
function isoOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function bump(id?: string) {
  revalidatePath("/admin/promo-codes");
  if (id) revalidatePath(`/admin/promo-codes/${id}`);
}

export async function createPromoCodeAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) redirect("/admin/promo-codes/new?error=code_required");

  const { data, error } = await supabase
    .from("promo_codes")
    .insert({
      code,
      description: nullable(formData.get("description")),
      discount_type: String(formData.get("discount_type") ?? "percent"),
      discount_value: numOrNull(formData.get("discount_value")) ?? 0,
      applies_to: String(formData.get("applies_to") ?? "both"),
      min_amount_php: numOrNull(formData.get("min_amount_php")),
      max_uses: intOrNull(formData.get("max_uses")),
      valid_from: isoOrNull(formData.get("valid_from")),
      valid_until: isoOrNull(formData.get("valid_until")),
      is_active: formData.get("is_active") === "on",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/admin/promo-codes/new?error=${encodeURIComponent(error?.message ?? "create_failed")}`,
    );
  }
  bump();
  redirect(`/admin/promo-codes/${data!.id}?ok=1`);
}

export async function updatePromoCodeAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/promo-codes?error=missing_id");

  const patch = {
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    description: nullable(formData.get("description")),
    discount_type: String(formData.get("discount_type") ?? "percent"),
    discount_value: numOrNull(formData.get("discount_value")) ?? 0,
    applies_to: String(formData.get("applies_to") ?? "both"),
    min_amount_php: numOrNull(formData.get("min_amount_php")),
    max_uses: intOrNull(formData.get("max_uses")),
    valid_from: isoOrNull(formData.get("valid_from")),
    valid_until: isoOrNull(formData.get("valid_until")),
    is_active: formData.get("is_active") === "on",
  };

  const { error } = await supabase.from("promo_codes").update(patch).eq("id", id);
  if (error) redirect(`/admin/promo-codes/${id}?error=${encodeURIComponent(error.message)}`);
  bump(id);
  redirect(`/admin/promo-codes/${id}?ok=1`);
}

export async function deletePromoCodeAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase.from("promo_codes").delete().eq("id", id);
  bump();
  redirect("/admin/promo-codes?deleted=1");
}
