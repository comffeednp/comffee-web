"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeCustomerPrice } from "@/lib/game-topups/pricing";

// Game Top-Up admin config. Settings live as gt_* keys in site_settings (mirrors the site settings
// pattern); the catalog editor recomputes customer_price from codashop_price × discount on save.

export async function saveTopupSettingsAction(formData: FormData) {
  await requireFullAdmin();
  const sb = getSupabaseAdmin();
  const numeric = [
    "gt_discount_pct",
    "gt_vision_daily_cap",
    "gt_sla_minutes",
    "gt_ocr_lock_minutes_1",
    "gt_ocr_lock_minutes_2",
    "gt_price_freeze_threshold_pct",
  ];
  const rows = [
    { key: "gt_enabled", value: formData.get("gt_enabled") ? "true" : "false" },
    { key: "gt_require_codashop_up", value: formData.get("gt_require_codashop_up") ? "true" : "false" },
    ...numeric.map((k) => ({ key: k, value: String(formData.get(k) ?? "").trim() })),
  ];
  const { error } = await sb.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) redirect(`/admin/game-topups/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/game-topups/settings");
  revalidatePath("/game-topups");
  redirect("/admin/game-topups/settings?ok=1");
}

export async function saveCatalogRowAction(formData: FormData) {
  await requireFullAdmin();
  const sb = getSupabaseAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/game-topups/settings?error=missing_id");
  const codashop = Math.max(0, Number(formData.get("codashop_price")) || 0);
  const discount = Math.max(0, Math.min(90, Number(formData.get("discount_pct")) || 0));
  const active = !!formData.get("active");
  const frozen = !!formData.get("frozen");
  const customer = computeCustomerPrice(codashop, discount);
  const { error } = await sb
    .from("game_topup_catalog")
    .update({ codashop_price: codashop, discount_pct: discount, customer_price: customer, active, frozen })
    .eq("id", id);
  if (error) redirect(`/admin/game-topups/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/game-topups/settings");
  revalidatePath("/game-topups");
  redirect("/admin/game-topups/settings?ok=1");
}
