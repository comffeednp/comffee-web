import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";

/**
 * Releases pending_hold reservations whose hold_expires_at has passed.
 * Hit by GitHub Actions every 5 minutes.
 */
async function handleSweep() {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", notes: "auto-released: hold expired" })
    .eq("status", "pending_hold")
    .lt("hold_expires_at", nowIso)
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, released: (data ?? []).length };
}

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });
  }
  return NextResponse.json(await handleSweep());
}

export async function POST(request: Request) {
  return GET(request);
}
