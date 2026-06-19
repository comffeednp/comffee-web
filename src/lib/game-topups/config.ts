import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Admin-editable Game Top-Ups config, stored as `gt_*` keys in the existing site_settings key/value
// table (platform-level — this is Comffee's own operation, not per-cafe). Read with the service-role
// client so cron/webhook jobs work without a user session. Falls back to safe defaults.

export interface TopupSettings {
  enabled: boolean;
  discountPctGlobal: number;
  perGameDiscount: Record<string, number>;
  visionDailyCap: number;
  ocrLockMinutes1: number;
  ocrLockMinutes2: number;
  slaMinutes: number;
  priceFreezeThresholdPct: number;
}

export const TOPUP_SETTINGS_DEFAULTS: TopupSettings = {
  enabled: true,
  discountPctGlobal: 8,
  perGameDiscount: {},
  visionDailyCap: 500,
  ocrLockMinutes1: 15,
  ocrLockMinutes2: 1440, // 24h
  slaMinutes: 60,
  priceFreezeThresholdPct: 20,
};

const num = (v: unknown, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export async function getTopupSettings(): Promise<TopupSettings> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from("site_settings").select("key, value").like("key", "gt_%");
    const map: Record<string, string> = {};
    for (const r of (data ?? []) as Array<{ key: string; value: unknown }>) {
      map[r.key] = typeof r.value === "string" ? r.value : String(r.value ?? "");
    }
    const perGame: Record<string, number> = {};
    for (const k of Object.keys(map)) {
      const m = k.match(/^gt_discount_pct_(.+)$/);
      if (m) {
        const v = Number(map[k]);
        if (Number.isFinite(v)) perGame[m[1]] = v;
      }
    }
    return {
      enabled: map.gt_enabled !== undefined ? !(map.gt_enabled === "false" || map.gt_enabled === "0") : TOPUP_SETTINGS_DEFAULTS.enabled,
      discountPctGlobal: num(map.gt_discount_pct, TOPUP_SETTINGS_DEFAULTS.discountPctGlobal),
      perGameDiscount: perGame,
      visionDailyCap: num(map.gt_vision_daily_cap, TOPUP_SETTINGS_DEFAULTS.visionDailyCap),
      ocrLockMinutes1: num(map.gt_ocr_lock_minutes_1, TOPUP_SETTINGS_DEFAULTS.ocrLockMinutes1),
      ocrLockMinutes2: num(map.gt_ocr_lock_minutes_2, TOPUP_SETTINGS_DEFAULTS.ocrLockMinutes2),
      slaMinutes: num(map.gt_sla_minutes, TOPUP_SETTINGS_DEFAULTS.slaMinutes),
      priceFreezeThresholdPct: num(map.gt_price_freeze_threshold_pct, TOPUP_SETTINGS_DEFAULTS.priceFreezeThresholdPct),
    };
  } catch {
    return TOPUP_SETTINGS_DEFAULTS;
  }
}

export function discountForGame(s: TopupSettings, game: string): number {
  return s.perGameDiscount[game] ?? s.discountPctGlobal;
}
