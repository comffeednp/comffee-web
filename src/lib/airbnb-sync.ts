/**
 * Shared Airbnb iCal sync logic — called both by the cron route handler
 * and directly from admin server actions (to avoid HTTP round-trips + auth issues).
 */

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
    error?: string;
  }>;
}

export async function runAirbnbSync(calendarId?: string): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();

  let q = supabase.from("airbnb_calendars").select("id, branch_id, ical_url, label");
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

      const { data: existing } = await supabase
        .from("reservations")
        .select("id, ical_uid")
        .eq("branch_id", cal.branch_id)
        .eq("source", "airbnb")
        .in("status", ["pending_hold", "confirmed"]);

      const existingByUid = new Map(
        (existing ?? []).map((r) => [r.ical_uid as string, r.id as string]),
      );

      let upserted = 0;
      const seenUids = new Set<string>();

      for (const ev of events) {
        seenUids.add(ev.uid);
        const existingId = existingByUid.get(ev.uid);
        if (existingId) {
          await supabase
            .from("reservations")
            .update({ check_in: ev.start, check_out: ev.end, guest_name: ev.summary })
            .eq("id", existingId);
        } else {
          await supabase.from("reservations").insert({
            branch_id: cal.branch_id,
            source: "airbnb",
            status: "confirmed",
            check_in: ev.start,
            check_out: ev.end,
            guest_name: ev.summary || "Airbnb guest",
            ical_uid: ev.uid,
          });
        }
        upserted++;
      }

      let cancelled = 0;
      for (const [uid, id] of existingByUid) {
        if (!seenUids.has(uid)) {
          await supabase.from("reservations").update({ status: "cancelled" }).eq("id", id);
          cancelled++;
        }
      }

      await supabase
        .from("airbnb_calendars")
        .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
        .eq("id", cal.id);

      results.push({ calendar_id: cal.id, upserted, cancelled });
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
