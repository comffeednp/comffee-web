import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelReservationWithRefund } from "@/lib/booking-cancel";

export const runtime = "nodejs";

/**
 * Request-to-book 24h timeout. Any paid booking still WAITING for owner approval
 * 24h after the request landed is auto-declined + refunded (Airbnb-style), so a
 * guest's money is never held indefinitely on an unanswered request.
 *
 * Driven by the every-15-min cron (this server's scheduled task), but the 24h
 * window means hourly/daily would be fine too — it just sweeps whatever is stale.
 */
async function run(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from("reservations")
    .select("id")
    .eq("status", "pending_approval")
    .lt("approval_requested_at", cutoff);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!stale || stale.length === 0) return NextResponse.json({ ok: true, autoRejected: 0 });

  // A refund row records who issued it (created_by_admin_id → admin_users). For an
  // automated decline there's no human, so we attribute it to a super_admin as the
  // system actor. If somehow none exists, we still free the dates and flag the row
  // for manual refund rather than skip the cancellation.
  const { data: sysAdmin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();
  const adminId = (sysAdmin as { id?: string } | null)?.id ?? null;

  let autoRejected = 0;
  for (const r of stale) {
    const id = r.id as string;
    try {
      if (adminId) {
        await cancelReservationWithRefund(id, "Auto-declined: host did not respond within 24 hours", adminId);
      } else {
        await supabase
          .from("reservations")
          .update({ status: "cancelled", notes: "Auto-declined (24h) — manual refund needed (no system admin found)" })
          .eq("id", id);
      }
      autoRejected++;
    } catch (e) {
      console.error("[auto-reject] failed for", id, e);
    }
  }
  return NextResponse.json({ ok: true, autoRejected });
}

export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
