import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret");
  return provided === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await handleSweep());
}

export async function POST(request: Request) {
  return GET(request);
}
