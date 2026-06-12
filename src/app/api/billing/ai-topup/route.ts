import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { createQrPhIntent, getQrPhIntentStatus, isPaymongoConfigured } from "@/lib/paymongo";

export const runtime = "nodejs";

// AI token top-ups — charged on the PLATFORM PayMongo account (owner
// 2026-06-12: "token payments go directly to me, same as the package
// payment"). The COUNTER calls this (never the customer PC): it relays the
// seat's request, renders the returned QR Ph image, polls GET for settlement,
// and grants tokens from its own sealed ledger on paid. Because the money is
// Comffee's and the tokens burn Comffee's Anthropic key, this works on EVERY
// package — including free-tier partner cafes.
//
// The caller's LICENSE key is hashed into the intent metadata so the refund
// endpoint can prove a void request comes from the cafe that created the
// charge. No Google auth here (a counter isn't a person) — rate-limited like
// /api/billing/subscribe.

const keyHash = (k: string) => crypto.createHash("sha256").update(k).digest("hex").slice(0, 32);

export async function POST(req: NextRequest) {
  let body: { amount?: number; modelId?: string; station?: string; cafeId?: string; licenseKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isPaymongoConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const amount = Math.trunc(Number(body.amount));
  // Same technical bounds as the counter catalogue: ₱1 … ₱20,000 (no business minimum).
  if (!(amount >= 100) || amount > 2_000_000) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const modelId = String(body.modelId || "").toLowerCase().slice(0, 20);
  const cafeId = String(body.cafeId || "").slice(0, 64);
  const licenseKey = String(body.licenseKey || "");

  const rl = checkRateLimit(`ai-topup:${cafeId || req.headers.get("x-forwarded-for") || "anon"}`, 30, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const intent = await createQrPhIntent({
      amountCentavos: amount,
      description: `Comffee AI tokens · ${modelId || "claude"} · ${body.station || "PC"}`,
      metadata: {
        kind: "ai-topup",
        modelId,
        cafeId,
        station: String(body.station || "").slice(0, 40),
        lk: licenseKey ? keyHash(licenseKey) : "",
      },
    });
    return NextResponse.json({
      id: intent.id,
      qrImage: intent.qrImage,
      expiresAt: intent.expiresAt,
      amount: intent.amount,
      // test-mode settle link (null in live) — used by the desktop selftests only
      testUrl: intent.testUrl,
    });
  } catch (e) {
    console.error("ai-topup create failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "create_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^pi_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const s = await getQrPhIntentStatus(id);
    return NextResponse.json({ id, status: s.status, paid: s.paid, paymentId: s.paymentId });
  } catch (e) {
    return NextResponse.json({ error: "lookup_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}
