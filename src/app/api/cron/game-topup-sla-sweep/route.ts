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
  let partialDelivered = 0;
  for (const o of (pendingBreached ?? []) as Array<{ id: string; amount_php: number; paymongo_payment_id: string | null }>) {
    // NEVER auto-refund an order that already has a DELIVERED (verified) line. Auto-confirm can tick lines
    // on a 'pending' order (delivery doesn't require a staff claim → it never enters 'processing'), so a
    // pending-past-SLA order may be partially/fully delivered. Refunding it would pay the customer AND give
    // the (already-bought) credits. Leave it pending for manual resolution in the console (same spirit as
    // the 'processing' exemption below). Cheap pre-check before the atomic claim.
    const { data: deliveredLine } = await admin
      .from("game_topup_order_lines")
      .select("id")
      .eq("order_id", o.id)
      .eq("status", "verified")
      .limit(1)
      .maybeSingle();
    if (deliveredLine) {
      partialDelivered++;
      continue;
    }

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

  // 3b) GC abandoned per-identity verify attempts (account-first verification creates these BEFORE any
  //     order — a bot could upload screenshots without ever checking out). Delete rows untouched for >24h
  //     and best-effort remove their stored screenshots so the private bucket doesn't grow unbounded.
  let verifyAttemptsPurged = 0;
  const { data: staleAttempts } = await admin
    .from("game_topup_verify_attempts")
    .delete()
    .lt("updated_at", draftCutoff)
    .select("id, last_screenshot_path");
  if (staleAttempts && staleAttempts.length) {
    verifyAttemptsPurged = staleAttempts.length;
    const paths = (staleAttempts as Array<{ last_screenshot_path: string | null }>)
      .map((r) => r.last_screenshot_path)
      .filter((p): p is string => !!p);
    if (paths.length) {
      // A verify-attempt screenshot is the SAME object an order line references (pay copies the path, not the
      // file). NEVER delete a path still referenced by an order line, or staff lose live-order proof.
      const { data: refs } = await admin
        .from("game_topup_order_lines")
        .select("screenshot_path")
        .in("screenshot_path", paths);
      const referenced = new Set((refs ?? []).map((r) => r.screenshot_path as string));
      const orphans = paths.filter((p) => !referenced.has(p));
      if (orphans.length) {
        await admin.storage
          .from("game-topup-screenshots")
          .remove(orphans)
          .then(() => {}, (e) => console.error("[game-topup sla-sweep] screenshot GC failed", e instanceof Error ? e.message : e));
      }
    }
  }
  if (processingStuck > 0) {
    console.error(`[game-topup sla-sweep] ${processingStuck} processing order(s) past SLA — manual review (see /admin/game-topups)`);
  }
  if (manual > 0) {
    console.error(`[game-topup sla-sweep] ${manual} pending order(s) need a MANUAL refund — see /admin/game-topups (status=failed)`);
  }

  if (partialDelivered > 0) {
    console.error(`[game-topup sla-sweep] ${partialDelivered} pending order(s) past SLA have a delivered line — NOT auto-refunded; resolve manually in /admin/game-topups`);
  }

  return NextResponse.json({
    ok: true,
    draftsPurged: deletedDrafts?.length ?? 0,
    pendingRefunded: refunded,
    pendingManual: manual,
    partialDelivered,
    processingStuck,
    verifyAttemptsPurged,
  });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
