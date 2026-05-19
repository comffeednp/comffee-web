import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PromoTarget = "order" | "reservation";

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  applies_to: "order" | "reservation" | "both";
  min_amount_php: number | null;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

export interface AppliedDiscount {
  promoCode: PromoCode;
  discountPhp: number;
  finalAmountPhp: number;
}

/**
 * Validate a promo code against an amount + target type. Returns the
 * computed discount, or throws an Error with a user-facing message.
 */
export async function validatePromoCode(
  rawCode: string,
  amountPhp: number,
  target: PromoTarget,
): Promise<AppliedDiscount> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error("PROMO_EMPTY");
  if (amountPhp <= 0) throw new Error("PROMO_BAD_AMOUNT");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .ilike("code", code)
    .maybeSingle();

  if (error) throw new Error(`PROMO_LOOKUP: ${error.message}`);
  if (!data) throw new Error("PROMO_NOT_FOUND");

  const promo = data as PromoCode;

  if (!promo.is_active) throw new Error("PROMO_INACTIVE");

  // Date window
  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    throw new Error("PROMO_NOT_YET_VALID");
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    throw new Error("PROMO_EXPIRED");
  }

  // Applies to target?
  if (promo.applies_to !== "both" && promo.applies_to !== target) {
    throw new Error("PROMO_WRONG_TARGET");
  }

  // Min amount?
  if (promo.min_amount_php && amountPhp < Number(promo.min_amount_php)) {
    throw new Error("PROMO_BELOW_MIN");
  }

  // Max uses?
  if (promo.max_uses && promo.used_count >= promo.max_uses) {
    throw new Error("PROMO_USED_UP");
  }

  // Compute discount
  let discountPhp: number;
  if (promo.discount_type === "percent") {
    discountPhp = (amountPhp * Number(promo.discount_value)) / 100;
  } else {
    discountPhp = Number(promo.discount_value);
  }
  // Round to 2 decimals + clamp at the total
  discountPhp = Math.min(amountPhp, Math.round(discountPhp * 100) / 100);
  const finalAmountPhp = Math.max(0, amountPhp - discountPhp);

  return { promoCode: promo, discountPhp, finalAmountPhp };
}

export interface RedemptionInput {
  promoCodeId: string;
  discountPhp: number;
  orderId?: string;
  reservationId?: string;
}

/** Record a redemption + bump the used_count. Called after a successful order/booking. */
export async function recordRedemption(input: RedemptionInput) {
  const supabase = getSupabaseAdmin();
  await supabase.from("promo_code_redemptions").insert({
    promo_code_id: input.promoCodeId,
    order_id: input.orderId ?? null,
    reservation_id: input.reservationId ?? null,
    discount_php: input.discountPhp,
  });
  // Atomic bump via RPC would be ideal — for MVP, read-modify-write
  const { data } = await supabase
    .from("promo_codes")
    .select("used_count")
    .eq("id", input.promoCodeId)
    .maybeSingle();
  const next = ((data?.used_count as number) ?? 0) + 1;
  await supabase
    .from("promo_codes")
    .update({ used_count: next })
    .eq("id", input.promoCodeId);
}
