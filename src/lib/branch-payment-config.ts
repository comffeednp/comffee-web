import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Reader for the per-branch online-payment config (table branch_payment_config, migration 0039).
 *
 * The POS writes this row; the website only READS it, ALWAYS server-side via the service-role key.
 * The table holds the owner's PayMongo SECRET key + webhook secret, so RLS denies every non-service
 * read — never query it from a client component or with the anon key.
 *
 * Two readers on purpose:
 *  - getBranchPaymentConfig(): the FULL row, including secrets. Use only in trusted server code that
 *    is about to talk to PayMongo (the create route, the webhook). Never pass its result to the
 *    browser.
 *  - getBranchPaymentDisplay(): a SAFE subset (method + fee/min/bonus) with NO secrets. This is what
 *    pages/components may send to the client.
 */

export interface BranchPaymentConfig {
  branch_id: string;
  online_payment_method: string; // '' | 'gcash_personal' | 'paymongo'
  paymongo_secret_key: string | null;
  paymongo_webhook_secret: string | null;
  fee_per_100: number;
  reservation_min_hours: number;
  reservation_min_topup: number;
  // Owner-set arrival grace (minutes) — how long a paid booking holds the seat from booking time
  // before the paid time is considered started + the seat frees (owner rule 2026-06-01). Set on the
  // POS admin Reservation tab, synced up. NULL/0 → fall back to the 10-min default in the create route.
  reservation_grace_minutes: number | null;
  bonus_type: string; // 'percent' | 'fixed'
  bonus_value: number;
  bonus_threshold: number;
  // DIY-QR online reservations (0041): the owner's uploaded "Bookings" QR Ph, synced from the POS.
  // booking_qr_tlv is the raw EMVCo string the website builds each booking's dynamic QR from; the
  // code_id is what the POS's PayMongo automatch keys on. NOT secret (it's drawn into the scanned QR).
  booking_qr_tlv: string | null;
  booking_qr_codeid: string | null;
  updated_at: string;
}

/** Non-secret subset that is safe to hand to a client component. */
export interface BranchPaymentDisplay {
  onlinePaymentMethod: string;
  reservationMinHours: number;
  reservationMinTopup: number;
  reservationGraceMinutes: number;
  bonusType: string;
  bonusValue: number;
  bonusThreshold: number;
}

/**
 * Full config row INCLUDING secrets — service-role only. Returns null if the branch has no config
 * row yet (owner hasn't set up online payments). Callers MUST treat null / non-'paymongo' method as
 * "online reservations not available".
 */
export async function getBranchPaymentConfig(
  branchId: string,
): Promise<BranchPaymentConfig | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("branch_payment_config")
      .select(
        "branch_id, online_payment_method, paymongo_secret_key, paymongo_webhook_secret, fee_per_100, reservation_min_hours, reservation_min_topup, reservation_grace_minutes, bonus_type, bonus_value, bonus_threshold, booking_qr_tlv, booking_qr_codeid, updated_at",
      )
      .eq("branch_id", branchId)
      .maybeSingle();
    return (data as BranchPaymentConfig | null) ?? null;
  } catch {
    // No env vars during build prerender, etc. Treat as "no config".
    return null;
  }
}

/**
 * True only when this branch is ready to take online reservations.
 *
 * Requires: online_payment_method === 'paymongo' AND a saved PayMongo SECRET key.
 *
 * WHY the secret key, not booking_qr_tlv (API rewrite, 2026-06-01): online bookings moved OFF the
 * home-made "Bookings QR" onto PayMongo's hosted Checkout Session (the website creates it with the
 * branch's own secret key; PayMongo's webhook confirms it). So readiness now means (a) method is
 * paymongo and (b) we hold the secret key to create the checkout. The old DIY-QR booking_qr_tlv is no
 * longer used for reservations (counter still uses its own DIY QR, POS-side). See
 * [[project-online-pay-reserve-v2]] / PLAN-online-bookings-paymongo-api.md.
 */
export function isPaymongoReservationActive(
  config: BranchPaymentConfig | null,
): boolean {
  return (
    !!config &&
    config.online_payment_method === "paymongo" &&
    !!config.paymongo_secret_key
  );
}

/**
 * Non-secret display subset for the reserve page / branch page. Strips the PayMongo keys so they
 * never travel to the client. Returns null when there's no config row.
 */
export async function getBranchPaymentDisplay(
  branchId: string,
): Promise<BranchPaymentDisplay | null> {
  const config = await getBranchPaymentConfig(branchId);
  if (!config) return null;
  return {
    onlinePaymentMethod: config.online_payment_method,
    reservationMinHours: Number(config.reservation_min_hours ?? 1),
    reservationMinTopup: Number(config.reservation_min_topup ?? 0),
    reservationGraceMinutes: Number(config.reservation_grace_minutes ?? 10),
    bonusType: config.bonus_type ?? "percent",
    bonusValue: Number(config.bonus_value ?? 0),
    bonusThreshold: Number(config.bonus_threshold ?? 0),
  };
}

/**
 * Compute the member top-up bonus to SHOW the customer (display only — PanCafe applies the real
 * bonus). Returns null when there's no bonus to show (top-up below threshold, or value is 0).
 *
 * 'percent' → bonus = topup * value/100 ; 'fixed' → bonus = value (flat peso, added once).
 * The "total they'll get" = topup + bonus. We round to whole pesos for display.
 */
export function computeDisplayBonus(
  topupPhp: number,
  display: Pick<BranchPaymentDisplay, "bonusType" | "bonusValue" | "bonusThreshold">,
): { bonusPhp: number; totalPhp: number } | null {
  if (!topupPhp || topupPhp <= 0) return null;
  if (!display.bonusValue || display.bonusValue <= 0) return null;
  if (display.bonusThreshold > 0 && topupPhp < display.bonusThreshold) return null;

  const bonus =
    display.bonusType === "fixed"
      ? display.bonusValue
      : (topupPhp * display.bonusValue) / 100;
  const bonusPhp = Math.round(bonus);
  if (bonusPhp <= 0) return null;
  return { bonusPhp, totalPhp: Math.round(topupPhp) + bonusPhp };
}
