import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Live-seating ingest from a Comffee Clockwork counter's control-server.
 *
 * This REPLACES the old PanCafe sync script. Clockwork now owns PC time/seating
 * natively, so the counter pushes a full station snapshot here every few seconds.
 *
 * Auth: a per-branch token in the `x-sync-token` header, matched (constant-time)
 * against branches.pc_sync_token. The token is low-privilege — it only authorizes
 * writing THIS branch's public seating board. The powerful service-role key stays
 * server-side in Vercel env; the counter never holds it.
 */

type IncomingStation = {
  station_name: string;
  is_occupied?: boolean;
  current_session_started_at?: string | null;
  current_session_ends_at?: string | null;
  current_session_member_id?: number | null;
  current_session_amount_php?: number | null;
  sort_order?: number;
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const token = request.headers.get("x-sync-token") ?? "";
  let body: { branchId?: string; stations?: IncomingStation[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const branchId = (body.branchId ?? "").trim();
  if (!branchId || !token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!Array.isArray(body.stations)) {
    return NextResponse.json({ error: "stations_required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: branch } = await db
    .from("branches")
    .select("id, pc_sync_token")
    .eq("id", branchId)
    .maybeSingle();
  const branchToken = (branch as { pc_sync_token?: string } | null)?.pc_sync_token ?? "";
  if (!branch || !branchToken || !safeEqual(token, branchToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const rows = body.stations
    .filter((s) => s && typeof s.station_name === "string" && s.station_name.trim())
    .map((s, i) => ({
      branch_id: branchId,
      station_name: s.station_name.trim(),
      is_occupied: !!s.is_occupied,
      current_session_started_at: s.current_session_started_at ?? null,
      current_session_ends_at: s.current_session_ends_at ?? null,
      current_session_member_id: s.current_session_member_id ?? null,
      current_session_amount_php:
        typeof s.current_session_amount_php === "number" ? s.current_session_amount_php : null,
      sort_order: typeof s.sort_order === "number" ? s.sort_order : i,
      last_synced_at: now,
    }));

  if (!rows.length) return NextResponse.json({ ok: true, count: 0, syncedAt: now });

  const { error } = await db
    .from("pc_stations")
    .upsert(rows, { onConflict: "branch_id,station_name" });
  if (error) {
    return NextResponse.json({ error: "upsert_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length, syncedAt: now });
}
