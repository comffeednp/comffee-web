import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { createRefund, getQrPhIntentStatus } from "@/lib/paymongo";
import { getRenewableLicense } from "@/lib/subscription-billing";

export const runtime = "nodejs";

// Void an AI token top-up (the counter's "no refunds anywhere except a void",
// platform-charged variant). AUTHORIZATION: the caller presents its LICENSE
// key; we verify (a) the license exists and is active in the CONTROL project,
// and (b) its hash matches the one stamped into the intent's metadata at
// create — so a cafe can only ever refund ITS OWN charges, and a leaked
// intent id alone refunds nothing. The token claw-back happens on the counter
// (sealed ledger) once this returns ok.

const keyHash = (k: string) => crypto.createHash("sha256").update(k).digest("hex").slice(0, 32);

export async function POST(req: NextRequest) {
  let body: { id?: string; licenseKey?: string; reason?: string; amountPhp?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const id = String(body.id || "");
  const licenseKey = String(body.licenseKey || "");
  const amountPhp = Number(body.amountPhp);
  if (!/^pi_[A-Za-z0-9]+$/.test(id) || !licenseKey || !(amountPhp > 0)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const rl = checkRateLimit(`ai-topup-refund:${keyHash(licenseKey)}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const lic = await getRenewableLicense(licenseKey);
    if (!lic || lic.status !== "active") return NextResponse.json({ error: "license_invalid" }, { status: 403 });

    const s = await getQrPhIntentStatus(id);
    if (s.metadata?.kind !== "ai-topup") return NextResponse.json({ error: "not_an_ai_topup" }, { status: 400 });
    if (!s.metadata?.lk || s.metadata.lk !== keyHash(licenseKey)) {
      return NextResponse.json({ error: "not_your_charge" }, { status: 403 });
    }
    if (!s.paid || !s.paymentId) return NextResponse.json({ error: "not_paid" }, { status: 409 });

    const r = await createRefund({
      paymentId: s.paymentId,
      amountPhp,
      reason: "requested_by_customer",
      notes: String(body.reason || "void from counter").slice(0, 120),
    });
    return NextResponse.json({ ok: true, refundId: r.id, status: r.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    // PayMongo refuses some QR Ph sources via API — surface it so the counter
    // offers the manual-dashboard path, exactly like branch-key refunds.
    return NextResponse.json({ error: "refund_failed", detail: msg }, { status: 502 });
  }
}
