import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Public read: the upcoming reserved time ranges for one bookable spot, so the booking UI can show
// which times are taken (open vs reserved) and block a clashing slot before payment. Returns only
// start/end timestamps — no customer details. floorplan_reservations is service-role only (RLS), so
// this server route is the only way the browser can see availability. (2026-06-13)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") || "";
  const elementIdx = Number(url.searchParams.get("elementIdx"));
  if (!/^[0-9a-f-]{36}$/i.test(branchId) || !Number.isInteger(elementIdx) || elementIdx < 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // include a session that's ending now
  const { data, error } = await supabase
    .from("floorplan_reservations")
    .select("start_at, ends_at")
    .eq("branch_id", branchId)
    .eq("element_idx", elementIdx)
    .in("status", ["pending", "confirmed"])
    .gte("ends_at", cutoff)
    .order("start_at", { ascending: true });
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });

  const reserved = (data ?? []).map((r) => ({ start: r.start_at as string, ends: r.ends_at as string }));
  return NextResponse.json({ ok: true, reserved }, { headers: { "Cache-Control": "no-store" } });
}
