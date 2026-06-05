// Shared, PURE rules for online PC reservation (no server-only imports, so the client island, the
// server page, and the booking API can all use the same numbers/logic).

// A PC must be continuously VACANT for this long before it's offered for online reservation. The
// clock (pc_stations.vacant_since, maintained by a DB trigger — see migration 0052) starts when the
// POS marks the seat free, which is already ~75s after the player leaves (the POS's confirm guard).
export const MIN_VACANT_MINUTES = 5;
const MIN_VACANT_MS = MIN_VACANT_MINUTES * 60_000;

/** True when a station is free AND has been vacant long enough to reserve online. */
export function isReservableVacant(
  isOccupied: boolean,
  vacantSince: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (isOccupied) return false;
  if (!vacantSince) return false; // unknown vacancy moment → not yet (never offer a false-vacant)
  return nowMs - new Date(vacantSince).getTime() >= MIN_VACANT_MS;
}

/** Whole minutes until a vacant-but-settling station becomes reservable (1..MIN_VACANT_MINUTES). Only
 *  meaningful for a vacant station that isn't reservable yet; returns 0 once it's ready. */
export function minutesUntilReservable(
  vacantSince: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!vacantSince) return MIN_VACANT_MINUTES;
  const remainMs = MIN_VACANT_MS - (nowMs - new Date(vacantSince).getTime());
  return remainMs <= 0 ? 0 : Math.ceil(remainMs / 60_000);
}
