import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCheckoutSession } from "@/lib/paymongo";
import { getRenewableLicense, SUBSCRIPTION_TIERS } from "@/lib/subscription-billing";

export const runtime = "nodejs";

// Create a QR Ph RENEWAL payment for an EXISTING Partner-Cafe license, on the PLATFORM PayMongo
// account. Called by the POS when the owner pays to extend their current key — no new key is minted;
// the paid webhook calls the renew_license RPC in the LICENSE project, which owns the owner-locked
// date math (extend from the DUE date — paying early adds a month to the term end; an expired
// license restarts from now). The POS polls /api/billing/subscribe/status with the referenceId.
//   -> { referenceId, checkoutUrl, amount, currentExpiry }
function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  return u && u.startsWith("https://") ? u : "https://comffee.org";
}

// CMFE-XXXX-XXXX-XXXX — matches the POS license input mask (normalized to uppercase below).
const LICENSE_KEY_RE = /^CMFE(-[A-Z0-9]{4}){3}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { licenseKey?: string; machineId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
  const email = String(body.email || "").trim().toLowerCase();
  const machineId = body.machineId ? String(body.machineId) : null;

  if (!LICENSE_KEY_RE.test(licenseKey)) {
    return NextResponse.json({ error: "invalid_license" }, { status: 400 });
  }

  const rl = checkRateLimit(`billing-renew:${licenseKey}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let license;
  try {
    license = await getRenewableLicense(licenseKey);
  } catch (e) {
    console.error("renewal license lookup failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
  if (!license) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Legacy/lifetime plans don't renew through this flow — only the monthly subscription tiers do.
  const t = SUBSCRIPTION_TIERS[license.plan as keyof typeof SUBSCRIPTION_TIERS];
  if (!t) return NextResponse.json({ error: "not_renewable" }, { status: 400 });

  // Receipt email: the caller's (if valid) → the license's business_name when it holds an email
  // (early licenses stored the owner's email there) → '' (renewal still works, just no email).
  const orderEmail = EMAIL_RE.test(email)
    ? email
    : license.business_name && EMAIL_RE.test(license.business_name.trim())
      ? license.business_name.trim().toLowerCase()
      : "";

  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin
    .from("subscription_orders")
    .insert({
      kind: "renewal",
      license_key: licenseKey,
      tier: license.plan,
      email: orderEmail,
      machine_id: machineId,
      amount_php: t.amountPhp,
      status: "unpaid",
    })
    .select("id")
    .single();
  if (error || !order) {
    console.error("renewal order insert failed", error?.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  try {
    const checkout = await createCheckoutSession({
      amountPhp: t.amountPhp,
      description: `Comffee POS renewal · ${t.name}`,
      lineItemName: `${t.name} — 1 month renewal`,
      paymentMethodTypes: ["qrph"], // QR Ph only (covers GCash/Maya/banks via one QR)
      successUrl: `${siteUrl()}/`,
      cancelUrl: `${siteUrl()}/`,
      remarks: `renewal:${order.id}`,
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
      currentExpiry: license.expires_at,
    });
  } catch (e) {
    // Couldn't create the checkout → drop the dangling order so a retry starts clean.
    await admin.from("subscription_orders").delete().eq("id", order.id);
    console.error("renewal checkout failed", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "checkout_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
