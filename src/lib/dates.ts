/**
 * Lightweight date helpers for the booking flow. We deliberately don't pull
 * in date-fns / dayjs — this is everything we actually need.
 */

/** Format a Date as YYYY-MM-DD (locale-agnostic, not UTC-shifted) */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a local Date at midnight */
export function fromDateString(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Number of nights between two YYYY-MM-DD strings (check_out - check_in) */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = fromDateString(checkIn);
  const b = fromDateString(checkOut);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/** Today as YYYY-MM-DD */
export function todayString(): string {
  return toDateString(new Date());
}

/** Add days to a YYYY-MM-DD string */
export function addDays(dateStr: string, days: number): string {
  const d = fromDateString(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Pretty-print "Apr 9 → Apr 12, 2026" */
export function formatRange(checkIn: string, checkOut: string): string {
  const a = fromDateString(checkIn);
  const b = fromDateString(checkOut);
  const sameYear = a.getFullYear() === b.getFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return `${fmt(a, !sameYear)} → ${fmt(b, true)}`;
}
