import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createRefund, isPaymongoConfigured } from "@/lib/paymongo";

export const runtime = "nodejs";

// SLA sweeper. A paid order that's still unfulfilled past its sla_due_at is auto-handled: attempt a
// PayMongo refund (works for card); QR Ph payments can't be API-refunded, so those are marked 'failed'
// and surfaced in the admin console for a manual GCash/InstaPay refund (the legal auto-refund duty for
// an undeliverable order). Also purges stale DRAFT orders (never paid) so they don't accumulate.
// Best run every ~15 min via the box's Scheduled Task (Vercel free-tier crons are daily-only); the
// daily vercel.json entry is just a backstop.
async function handle(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1) Purge abandoned drafts (created, never paid) older than 24h.
  const draftCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: deletedDrafts } = await admin
    .from("game_topup_orders")
    .delete()
    .eq("status", "draft")
    .lt("created_at", draftCutoff)
    .select("id");

  // 2) Auto-refund only PENDING orders past SLA. 'pending' = paid but never claimed/started, so NOTHING
  //    has been delivered → a full refund is always correct and safe. A 'processing' order is being
  //    worked by staff (possibly partially delivered), so it is NEVER auto-refunded — that would risk
  //    paying the customer AND delivering, or over-refunding a partly-delivered combo; it goes to manual
  //    review instead.
  const { data: pendingBreached } = await admin
    .from("game_topup_orders")
    .select("id, amount_php, paymongo_payment_id")
    .eq("status", "pending")
    .lt("sla_due_at", nowIso);

  let refunded = 0;
  let manual = 0;
  for (const o of (pendingBreached ?? []) as Array<{ id: string; amount_php: number; paymongo_payment_id: string | null }>) {
    // ATOMIC CLAIM before any external call: flip pending→failed; only the row we WIN (still 'pending',
    // not concurrently claimed by staff → processing, nor delivered) proceeds to the refund. This closes
    // the window where a concurrent delivery and the refund could both succeed.
    const { data: claimed } = await admin
      .from("game_topup_orders")
      .update({ status: "failed" })
      .eq("id", o.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue; // lost the claim (staff/delivery moved it) — skip

    let didApiRefund = false;
    if (isPaymongoConfigured() && o.paymongo_payment_id && Number(o.amount_php) > 0) {
      try {
        await createRefund({
          paymentId: o.paymongo_payment_id,
          amountPhp: Number(o.amount_php),
          reason: "others",
          notes: "Game top-up undeliverable within SLA — auto-refund",
        });
        didApiRefund = true;
      } catch (e) {
        // QR Ph can't be API-refunded ("source type qrph") → leave at 'failed' for a manual refund.
        console.error("[game-topup sla-sweep] api refund failed (likely qrph, manual needed)", o.id, e instanceof Error ? e.message : e);
      }
    }
    if (didApiRefund) {
      await admin.from("game_topup_orders").update({ status: "refunded" }).eq("id", o.id).eq("status", "failed");
    }
    await admin
      .from("game_topup_fulfillment_events")
      .insert({
        order_id: o.id,
        source: "manual",
        raw_text: didApiRefund
          ? "SLA breach — auto-refunded via PayMongo"
          : "SLA breach — needs MANUAL refund (QR Ph / no payment id)",
        ref: `sla-${o.id}`,
      })
      .then(() => {}, () => {}); // best-effort audit row; safe if it ever collides on the ref

    if (didApiRefund) refunded++;
    else manual++;
  }

  // 3) Flag PROCESSING orders past SLA for manual review — never auto-refunded (staff may be mid-delivery).
  const { data: stuckProcessing } = await admin
    .from("game_topup_orders")
    .select("id")
    .eq("status", "processing")
    .lt("sla_due_at", nowIso);
  const processingStuck = stuckProcessing?.length ?? 0;
  if (processingStuck > 0) {
    console.error(`[game-topup sla-sweep] ${processingStuck} processing order(s) past SLA — manual review (see /admin/game-topups)`);
  }
  if (manual > 0) {
    console.error(`[game-topup sla-sweep] ${manual} pending order(s) need a MANUAL refund — see /admin/game-topups (status=failed)`);
  }

  return NextResponse.json({
    ok: true,
    draftsPurged: deletedDrafts?.length ?? 0,
    pendingRefunded: refunded,
    pendingManual: manual,
    processingStuck,
  });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
