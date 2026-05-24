/**
 * Shared Airbnb iCal sync logic — called both by the cron route handler
 * and directly from admin server actions (to avoid HTTP round-trips + auth issues).
 */

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseICal } from "@/lib/ical";

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
    error?: string;
  }>;
}

export async function runAirbnbSync(calendarId?: string): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();

  let q = supabase.from("airbnb_calendars").select("id, branch_id, ical_url, label, branch:branches(slug)");
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

      // Include cancelled rows so we don't re-import UIDs that admin already cancelled
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
        // overlaps an existing website booking and trips the no-overlap
        // constraint) must not stop the rest of the calendar from importing.
        try {
          const row = existingByUid.get(ev.uid);
          if (row) {
            // Admin already cancelled this — don't re-import from Airbnb
            if (row.status === "cancelled") continue;
            const { error: upErr } = await supabase
              .from("reservations")
              .update({ check_in: ev.start, check_out: ev.end, guest_name: ev.summary })
              .eq("id", row.id);
            if (upErr) throw new Error(upErr.message);
          } else {
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

      let cancelled = 0;
      for (const [uid, row] of existingByUid) {
        // Only cancel rows that disappeared from Airbnb AND aren't already cancelled
        if (!seenUids.has(uid) && row.status !== "cancelled") {
          await supabase.from("reservations").update({ status: "cancelled" }).eq("id", row.id);
          cancelled++;
        }
      }

      // Record a partial-failure note so the admin can see something went wrong,
      // without failing the whole sync (the events that did import are kept).
      const syncNote = failed > 0 ? `${failed} event(s) failed: ${firstEventError}` : null;
      await supabase
        .from("airbnb_calendars")
        .update({ last_synced_at: new Date().toISOString(), last_sync_error: syncNote })
        .eq("id", cal.id);

      const branchRaw = cal.branch as { slug: string } | { slug: string }[] | null;
      const branchSlug = Array.isArray(branchRaw) ? branchRaw[0]?.slug : branchRaw?.slug;
      if (branchSlug) revalidatePath(`/branches/${branchSlug}`);

      results.push({ calendar_id: cal.id, upserted, cancelled, failed });
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
