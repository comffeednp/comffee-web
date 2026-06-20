// Shared Game Top-Ups types. Money fields are pesos (numeric in the DB; coerce with Number() at the
// boundary as the rest of the repo does). See supabase/migrations/0059_game_topups.sql.
import type { TopupStatus } from "./state";

export type { TopupStatus };
export type LineStatus = "pending" | "verified";

export interface CatalogItem {
  id: string;
  sku: string;
  game: string;
  region: string;
  vp_amount: number;
  label: string;
  codashop_price: number;
  discount_pct: number;
  customer_price: number;
  active: boolean;
  frozen: boolean;
  source_url: string | null;
  last_synced_at: string | null;
  sort_order: number;
}

export interface GameRow {
  id: string;
  slug: string;
  name: string;
  region_default: string;
  currency_label: string;
  codashop_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface TopupOrderLine {
  id: string;
  order_id: string;
  sku: string;
  vp_amount: number;
  codashop_price: number;
  customer_price: number;
  status: LineStatus;
  matched_ref: string | null;
  verified_at: string | null;
  position: number;
  // Line-level game + account (migration 0063): the order is a pure payment/receipt envelope; each line
  // carries its own (game, account) so ONE order can hold multiple games/accounts. account_verified is the
  // pre-pay SCREENSHOT proof (distinct from `status`, which is the post-pay fulfilment state).
  game: string | null;
  region: string | null;
  account_id: string | null;
  account_tag: string | null;
  account_verified: boolean;
  screenshot_path: string | null;
}

export interface TopupOrder {
  id: string;
  // Order-level game/identity are LEGACY envelope fields (nullable since 0063) — the source of truth is
  // now per-line (see TopupOrderLine). Kept for back-compat reads; a multi-account order leaves them null.
  game: string | null;
  region: string | null;
  riot_id: string | null;
  riot_tag: string | null;
  target_vp: number;
  fulfilled_vp: number;
  amount_php: number;
  customer_email: string | null;
  screenshot_path: string | null;
  ocr_tries: number;
  ocr_block_level: number;
  ocr_blocked_until: string | null;
  verified: boolean;
  consent_at: string | null;
  status: TopupStatus;
  status_token: string;
  source_cafe_id: string | null;
  claimed_by_admin_id: string | null;
  claimed_at: string | null;
  paymongo_checkout_id: string | null;
  paymongo_payment_intent_id: string | null;
  paymongo_payment_id: string | null;
  sla_due_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}
