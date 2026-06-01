/**
 * Pure decision logic for the Airbnb "freeing" step — no DB / server imports, so
 * the glitch guard and 2-check debounce can be unit-tested without a database.
 *
 * Airbnb's iCal export is flaky (intermittently truncated/empty). These two
 * guards stop a single bad fetch from freeing real bookings — the failure that
 * stranded 7 Imus nights as available while Airbnb still had them booked
 * (found + repaired 2026-06-02):
 *   1. glitch guard    — empty feed, or >50% smaller than the last clean run,
 *                        is treated as a glitch: free nothing, don't advance memory.
 *   2. 2-check debounce — a night must be missing on TWO consecutive runs before
 *                         it is freed; the first-miss set is carried forward.
 */

export interface ExistingNight {
  ical_uid: string;
  status: string;
}

export interface CancelPlan {
  /** true = feed looked truncated; we freed nothing this run. */
  glitch: boolean;
  /** UIDs to free now (missing two runs in a row). */
  toCancel: string[];
  /** UIDs missing for the first time — carried forward to next run. */
  nextMissing: string[];
  /** Event count to remember, or null to leave the stored count untouched. */
  nextCount: number | null;
}

export function planCancellations(
  feedUids: Set<string>,
  existing: ExistingNight[],
  prevMissing: string[],
  prevCount: number | null,
  feedCount: number,
): CancelPlan {
  const looksGlitchy =
    prevCount !== null &&
    prevCount > 0 &&
    (feedCount === 0 || feedCount < prevCount * 0.5);

  if (looksGlitchy) {
    return { glitch: true, toCancel: [], nextMissing: prevMissing, nextCount: null };
  }

  const prev = new Set(prevMissing);
  const missingNow: string[] = [];
  for (const r of existing) {
    if (r.status === "cancelled") continue; // already freed — ignore
    if (!feedUids.has(r.ical_uid)) missingNow.push(r.ical_uid);
  }
  return {
    glitch: false,
    toCancel: missingNow.filter((u) => prev.has(u)), // missing this run AND last run
    nextMissing: missingNow.filter((u) => !prev.has(u)), // first miss — carry forward
    nextCount: feedCount,
  };
}
