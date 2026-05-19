import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Re-export pure helpers for backwards compatibility — new callers should
// import directly from "@/lib/rate-window" to avoid pulling this server file.
export { isRateAvailableNow, computeRateTotals } from "./rate-window";

export interface ReservableRate {
  id: string;
  branch_id: string;
  category: string;
  label: string;
  description: string | null;
  price_php: number;
  unit: string;                       // 'hour' | 'pack' | 'session' | 'night'
  sort_order: number;
  pc_tier: string | null;             // 'regular' | 'vip' | null (both)
  duration_minutes: number | null;    // base unit minutes (60 for 'hour' rates)
  time_window_start: string | null;   // 'HH:MM'
  time_window_end: string | null;     // 'HH:MM'
}

/**
 * Load all reservable internet-cafe rates for a branch, filtered by PC tier
 * if provided. Rates with a time window are still returned — the caller is
 * responsible for greying them out / rejecting them outside the window.
 */
export async function getReservableRatesForBranch(
  branchId: string,
  tier?: "regular" | "vip" | null,
): Promise<ReservableRate[]> {
  try {
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("branch_rates")
      .select("*")
      .eq("branch_id", branchId)
      .eq("category", "internet")
      .eq("is_reservable_online", true)
      .order("sort_order", { ascending: true });
    if (tier === "regular" || tier === "vip") {
      q = q.or(`pc_tier.eq.${tier},pc_tier.is.null`);
    }
    const { data, error } = await q;
    if (error || !data) return [];
    return data as ReservableRate[];
  } catch {
    return [];
  }
}

// Pure helpers (isRateAvailableNow, computeRateTotals) live in rate-window.ts
// and are re-exported at the top of this file.
