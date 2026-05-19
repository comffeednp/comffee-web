import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";

/**
 * Periodic cleanup. Run daily via GitHub Actions. Prunes:
 *   - paymongo_webhook_events older than 90 days (idempotency keys we no longer need)
 *   - audit_log entries older than 1 year
 *   - cancelled reservations older than 1 year
 *   - resolved chat conversations older than 6 months (cascades messages)
 *
 * Without this, the DB grows unbounded.
 */
async function handleCleanup() {
  const supabase = getSupabaseAdmin();
  const now = Date.now();

  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const oneYearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  const sixMonthsAgo = new Date(now - 180 * 24 * 60 * 60 * 1000).toISOString();

  const results: Record<string, number | string> = {};

  const { data: webhookDeleted, error: whErr } = await supabase
    .from("paymongo_webhook_events")
    .delete()
    .lt("processed_at", ninetyDaysAgo)
    .select("id");
  results.paymongo_webhook_events = whErr
    ? `error:${whErr.message}`
    : (webhookDeleted ?? []).length;

  const { data: auditDeleted, error: alErr } = await supabase
    .from("audit_log")
    .delete()
    .lt("created_at", oneYearAgo)
    .select("id");
  results.audit_log = alErr ? `error:${alErr.message}` : (auditDeleted ?? []).length;

  const { data: cancelledRes, error: rsErr } = await supabase
    .from("reservations")
    .delete()
    .eq("status", "cancelled")
    .lt("created_at", oneYearAgo)
    .select("id");
  results.cancelled_reservations = rsErr
    ? `error:${rsErr.message}`
    : (cancelledRes ?? []).length;

  const { data: chatDeleted, error: chErr } = await supabase
    .from("chat_conversations")
    .delete()
    .eq("status", "resolved")
    .lt("last_message_at", sixMonthsAgo)
    .select("id");
  results.resolved_chats = chErr
    ? `error:${chErr.message}`
    : (chatDeleted ?? []).length;

  return { ok: true, results };
}

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  return NextResponse.json(await handleCleanup());
}

export async function POST(request: Request) {
  return GET(request);
}
