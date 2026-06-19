import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { guardMutating } from "@/lib/security";
import { createCheckoutSession, bookingPaymentMethods } from "@/lib/paymongo";
import { getTopupSettings } from "@/lib/game-topups/config";
import { isCodashopReachable } from "@/lib/game-topups/codashop";
import { isPhAllowed } from "@/lib/game-topups/geo";

export const runtime = "nodejs";

// Create the PayMongo checkout for a VERIFIED order. Comffee's money → PLATFORM key (no per-branch
// key). The amount is recomputed server-side from the order lines (never trust the client). The order
// status is flipped to 'pending' ONLY by the webhook on a signed payment.paid — this route never marks
// anything paid. On checkout failure the order is LEFT intact (it holds the verified screenshot) so the
// customer can retry.

function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  return u && u.startsWith("https://") ? u : "https://comffee.org";
}

const schema = z.object({
  orderId: z.string().uuid(),
  email: z.string().email(),
  consent: z.literal(true),
});

export async function POST(request: Request) {
  if (!isPhAllowed(request)) return NextResponse.json({ error: "ph_only" }, { status: 403 });

  const guarded = await guardMutating(request, {
    bucket: "game-topup-pay",
    limit: 10,
    windowMs: 10 * 60 * 1000,
    maxBytes: 4 * 1024,
  });
  if ("error" in guarded) return guarded.error;
  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  const { orderId, email } = parsed.data;

  const settings = await getTopupSettings();
  if (!settings.enabled) return NextResponse.json({ error: "disabled" }, { status: 503 });

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("game_topup_orders")
    .select("id, status, verified, target_vp, game, status_token")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!order.verified || order.status !== "verified") {
    return NextResponse.json({ error: "not_verified" }, { status: 409 });
  }

  // Recompute the amount from the lines — the source of truth, not a client-supplied figure.
  const { data: lines } = await admin
    .from("game_topup_order_lines")
    .select("customer_price")
    .eq("order_id", orderId);
  const amount = (lines ?? []).reduce((s, l) => s + Number(l.customer_price), 0);
  if (!(amount > 0)) return NextResponse.json({ error: "invalid_amount" }, { status: 409 });

  // Don't take money if Codashop is down — we can't buy the points to fulfil (owner rule 2026-06-20).
  // Fail-CLOSED: any non-2xx / timeout blocks the payment. The owner can flip gt_require_codashop_up off
  // in admin if this ever false-blocks (e.g. Codashop blocks our server IP). Outages AFTER payment are
  // covered by the 24h credit-or-refund SLA.
  if (settings.requireCodashopUp) {
    const { data: gameRow } = await admin
      .from("game_topup_games")
      .select("codashop_url")
      .eq("slug", order.game)
      .maybeSingle();
    const codaUrl =
      (gameRow as { codashop_url?: string | null } | null)?.codashop_url || "https://www.codashop.com/en-ph/";
    if (!(await isCodashopReachable(codaUrl))) {
      return NextResponse.json({ error: "fulfilment_unavailable" }, { status: 503 });
    }
  }

  await admin
    .from("game_topup_orders")
    .update({ customer_email: email, consent_at: new Date().toISOString(), amount_php: amount })
    .eq("id", orderId);

  try {
    const checkout = await createCheckoutSession({
      amountPhp: amount,
      description: `Comffee Game Top-Up · ${order.target_vp} VP`,
      lineItemName: `${order.game} top-up — ${order.target_vp} VP`,
      paymentMethodTypes: bookingPaymentMethods(amount),
      successUrl: `${siteUrl()}/game-topups/status/${order.status_token}`,
      cancelUrl: `${siteUrl()}/game-topups`,
      remarks: `game_topup:${orderId}`,
      // no secretKey → PLATFORM env key (Comffee's PayMongo account)
    });
    await admin
      .from("game_topup_orders")
      .update({
        paymongo_checkout_id: checkout.id,
        paymongo_payment_intent_id: checkout.payment_intent_id,
      })
      .eq("id", orderId);
    return NextResponse.json({ ok: true, checkoutUrl: checkout.checkout_url, statusToken: order.status_token });
  } catch (e) {
    console.error("[game-topup] checkout failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
