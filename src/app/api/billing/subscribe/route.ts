import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCheckoutSession } from "@/lib/paymongo";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription-billing";

export const runtime = "nodejs";

// Create a QR Ph subscription payment for a Partner Cafe, on the PLATFORM PayMongo account.
// Called by the POS (main process) during onboarding. No Google auth — the cafe isn't signed in;
// the POS sends its machineId + the owner's email. Returns the hosted-checkout URL; the POS renders
// it as a QR the owner scans with their phone, lands on PayMongo's QR Ph page, and pays.
//   -> { referenceId, checkoutUrl, amount }
function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  return u && u.startsWith("https://") ? u : "https://comffee.org";
}

export async function POST(req: NextRequest) {
  let body: { tier?: string; email?: string; machineId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const tier = String(body.tier || "");
  const email = String(body.email || "").trim().toLowerCase();
  const machineId = body.machineId ? String(body.machineId) : null;

  const t = SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS];
  if (!t) return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const rl = checkRateLimit(`billing-subscribe:${machineId ?? email}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin
    .from("subscription_orders")
    .insert({ tier, email, machine_id: machineId, amount_php: t.amountPhp, status: "unpaid" })
    .select("id")
    .single();
  if (error || !order) {
    console.error("subscription order insert failed", error?.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  try {
    const checkout = await createCheckoutSession({
      amountPhp: t.amountPhp,
      description: `Comffee POS subscription · ${t.name}`,
      lineItemName: `${t.name} — monthly subscription`,
      paymentMethodTypes: ["qrph"], // QR Ph only (covers GCash/Maya/banks via one QR)
      successUrl: `${siteUrl()}/`,
      cancelUrl: `${siteUrl()}/`,
      remarks: `subscription:${order.id}`,
      // no secretKey -> falls back to the PLATFORM env key (Comffee's PayMongo account)
    });
    await admin
      .from("subscription_orders")
      .update({
        paymongo_checkout_id: checkout.id,
        paymongo_payment_intent_id: checkout.payment_intent_id,
      })
      .eq("id", order.id);

    return NextResponse.json({
      referenceId: order.id,
      checkoutUrl: checkout.checkout_url,
      amount: t.amountPhp,
    });
  } catch (e) {
    // Couldn't create the checkout → drop the dangling order so a retry starts clean.
    await admin.from("subscription_orders").delete().eq("id", order.id);
    console.error("subscription checkout failed", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "checkout_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
