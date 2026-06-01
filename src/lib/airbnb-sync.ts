/**
 * Shared Airbnb iCal sync logic — called both by the cron route handler
 * and directly from admin server actions (to avoid HTTP round-trips + auth issues).
 *
 * MODEL: Airbnb owns its own nights, so we MIRROR its feed — on feed = blocked,
 * gone = freed. The hard part is that Airbnb's export is flaky: it now and then
 * returns a truncated or empty list. Two guards stop a single bad fetch from
 * freeing real bookings (which stranded 7 Imus nights, found + fixed 2026-06-02):
 *
 *   FLOW: fetch feed → (glitch guard) → insert/update/resurrect present nights
 *         → (2-check debounce) free nights gone twice in a row → save feed memory
 *
 *   1. glitch guard   — an empty feed, or one >50% smaller than the last clean
 *                       run, is treated as a fetch glitch: we free NOTHING and
 *                       don't advance the miss memory.
 *   2. 2-check debounce — a night must be missing on TWO consecutive runs before
 *                         we free it. `missing_uids` carries the first-miss set.
 *
 * Returning nights are resurrected by delete-then-insert, NOT a status flip: a
 * DB rule forbids un-cancelling a reservation (it protects WEBSITE bookings,
 * which this sync must never touch). All changes here are Airbnb-scoped.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseICal } from "@/lib/ical";
import { planCancellations } from "@/lib/airbnb-reconcile";

export interface SyncResult {
  ok: boolean;
  error?: string;
  calendars?: number;
  total_events?: number;
  results?: Array<{
    calendar_id: string;
    upserted: number;
    cancelled: number;
    failed?: number;
    glitch?: boolean;
    error?: string;
  }>;
}

export async function runAirbnbSync(calendarId?: string): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();

  let q = supabase
    .from("airbnb_calendars")
    .select(
      "id, branch_id, ical_url, label, last_event_count, missing_uids, branch:branches(slug)",
    );
  if (calendarId) q = q.eq("id", calendarId) as typeof q;

  const { data: calendars, error: calErr } = await q;
  if (calErr) return { ok: false, error: calErr.message };
  if (!calendars || calendars.length === 0) {
    return { ok: true, calendars: 0, total_events: 0 };
  }

  const results: SyncResult["results"] = [];

  for (const cal of calendars) {
    try {
      const res = await fetch(cal.ical_url, {
        headers: { "User-Agent": "Comffee-Sync/1.0" },
        cache: "no-store",
      });
      if (!res.ok) {
        await supabase
          .from("airbnb_calendars")
          .update({ last_sync_error: `HTTP ${res.status}`, last_synced_at: new Date().toISOString() })
          .eq("id", cal.id);
        results.push({ calendar_id: cal.id, upserted: 0, cancelled: 0, error: `fetch ${res.status}` });
        continue;
      }

      const text = await res.text();
      const events = parseICal(text);

      // Load every airbnb-sourced night for this branch, INCLUDING cancelled —
      // we resurrect a cancelled night when its UID returns to the feed.
      const { data: existing } = await supabase
        .from("reservations")
        .select("id, ical_uid, status")
        .eq("branch_id", cal.branch_id)
        .eq("source", "airbnb")
        .in("status", ["pending_hold", "confirmed", "cancelled"]);

      const existingByUid = new Map(
        (existing ?? []).map((r) => [
          r.ical_uid as string,
          { id: r.id as string, status: r.status as string },
        ]),
      );

      let upserted = 0;
      let failed = 0;
      let firstEventError: string | null = null;
      const seenUids = new Set<string>();

      for (const ev of events) {
        seenUids.add(ev.uid);
        // Each event is independent — one bad row (e.g. an Airbnb date that
        // overlaps a website booking and trips the no-overlap constraint) must
        // not stop the rest of the calendar from importing.
        try {
          const row = existingByUid.get(ev.uid);
          if (row && row.status !== "cancelled") {
            // Already active — just refresh dates/label.
            const { error: upErr } = await supabase
              .from("reservations")
              .update({ check_in: ev.start, check_out: ev.end, guest_name: ev.summary })
              .eq("id", row.id);
            if (upErr) throw new Error(upErr.message);
          } else if (row && row.status === "cancelled") {
            // The night is back on Airbnb but we'd previously freed it. The DB
            // forbids un-cancelling (that rule guards WEBSITE bookings), so we
            // delete the stale freed entry and re-add it as a fresh confirmed
            // Airbnb block — the same move that repaired Imus by hand.
            const { error: delErr } = await supabase.from("reservations").delete().eq("id", row.id);
            if (delErr) throw new Error(delErr.message);
            const { error: insErr } = await supabase.from("reservations").insert({
              branch_id: cal.branch_id,
              source: "airbnb",
              status: "confirmed",
              check_in: ev.start,
              check_out: ev.end,
              guest_name: ev.summary || "Airbnb guest",
              ical_uid: ev.uid,
            });
            if (insErr) throw new Error(insErr.message);
          } else {
            // Brand-new Airbnb night.
            const { error: insErr } = await supabase.from("reservations").insert({
              branch_id: cal.branch_id,
              source: "airbnb",
              status: "confirmed",
              check_in: ev.start,
              check_out: ev.end,
              guest_name: ev.summary || "Airbnb guest",
              ical_uid: ev.uid,
            });
            if (insErr) throw new Error(insErr.message);
          }
          upserted++;
        } catch (e) {
          failed++;
          if (!firstEventError) firstEventError = e instanceof Error ? e.message : "unknown";
        }
      }

      // Freeing step — glitch guard + 2-check debounce (see planCancellations).
      const plan = planCancellations(
        seenUids,
        (existing ?? []).map((r) => ({ ical_uid: r.ical_uid as string, status: r.status as string })),
        (cal.missing_uids as string[] | null) ?? [],
        cal.last_event_count as number | null,
        events.length,
      );

      let cancelled = 0;
      for (const uid of plan.toCancel) {
        const row = existingByUid.get(uid);
        if (!row) continue;
        await supabase.from("reservations").update({ status: "cancelled" }).eq("id", row.id);
        cancelled++;
      }

      // Record a partial-failure note so the admin sees something went wrong,
      // without failing the whole sync (events that did import are kept).
      const syncNote = plan.glitch
        ? `feed looked truncated (${events.length} vs ${cal.last_event_count}); kept existing blocks`
        : failed > 0
          ? `${failed} event(s) failed: ${firstEventError}`
          : null;

      await supabase
        .from("airbnb_calendars")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_error: syncNote,
          missing_uids: plan.nextMissing,
          // Only trust the count from a clean run, so a glitch can't become the
          // baseline the next glitch-check compares against.
          ...(plan.nextCount !== null ? { last_event_count: plan.nextCount } : {}),
        })
        .eq("id", cal.id);

      const branchRaw = cal.branch as { slug: string } | { slug: string }[] | null;
      const branchSlug = Array.isArray(branchRaw) ? branchRaw[0]?.slug : branchRaw?.slug;
      if (branchSlug) revalidatePath(`/branches/${branchSlug}`);

      results.push({ calendar_id: cal.id, upserted, cancelled, failed, glitch: plan.glitch });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      await supabase
        .from("airbnb_calendars")
        .update({ last_sync_error: msg, last_synced_at: new Date().toISOString() })
        .eq("id", cal.id);
      results.push({ calendar_id: cal.id, upserted: 0, cancelled: 0, error: msg });
    }
  }

  return { ok: true, results, calendars: calendars.length };
}
