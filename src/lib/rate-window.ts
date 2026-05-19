/**
 * Pure helpers for rate time-window validation + total computation.
 * Safe to import from client components — no server-only dependencies.
 */

export interface RateWindowInput {
  time_window_start?: string | null;
  time_window_end?: string | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
}

/**
 * Check if the given rate is currently available to purchase.
 * Time-gated rates (night promos) have `time_window_start` and
 * `time_window_end`; the current local time (Asia/Manila) must fall
 * within that window. Handles overnight windows (e.g. 22:00 → 06:00).
 */
export function isRateAvailableNow(
  rate: RateWindowInput,
  now = new Date(),
): boolean {
  const start = rate.time_window_start ?? rate.timeWindowStart ?? null;
  const end = rate.time_window_end ?? rate.timeWindowEnd ?? null;
  if (!start || !end) return true;

  const nowMinutes = manilaMinutesOfDay(now);
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes === null || endMinutes === null) return true;

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function parseTimeToMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes-since-midnight in Asia/Manila (UTC+8, no DST). */
function manilaMinutesOfDay(now: Date): number {
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  let mh = utcHours + 8;
  if (mh >= 24) mh -= 24;
  return mh * 60 + utcMinutes;
}

export function computeRateTotals(
  rate: { price_php: number; duration_minutes: number | null; unit: string },
  quantity: number,
): { totalPhp: number; totalMinutes: number } {
  const qty = Math.max(1, Math.round(quantity));
  const baseMinutes = rate.duration_minutes ?? 60;
  const isHourly = rate.unit === "hour";
  const actualQty = isHourly ? qty : 1;
  return {
    totalPhp: Number(rate.price_php) * actualQty,
    totalMinutes: baseMinutes * actualQty,
  };
}
