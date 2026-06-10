import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Polled by the POS onboarding while the QR is on screen. Reports the order state and, once paid +
// minted, hands back the license key so the POS can auto-activate. The PayMongo webhook is what
// flips the order to 'paid' and stamps the minted key — this route only reports.
// Also polled for RENEWAL orders (kind='renewal', created by /api/billing/renew) — those never get
// a new key; renewedUntil carries the extended expiry instead.
//   -> { status: 'pending' | 'paid' | 'expired', licenseKey: string | null,
//        kind: 'new' | 'renewal', renewedUntil: string | null }
const HOLD_MINUTES = 20;

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!ref) return NextResponse.json({ error: "missing_ref" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: o } = await admin
    .from("subscription_orders")
    .select("id, status, license_key, created_at, kind, renewed_until")
    .eq("id", ref)
    .maybeSingle();
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let status = o.status as string;
  // Self-expire a stale unpaid order so the POS stops waiting forever on an abandoned QR.
  if (
    status === "unpaid" &&
    o.created_at &&
    Date.now() - new Date(o.created_at as string).getTime() > HOLD_MINUTES * 60 * 1000
  ) {
    await admin
      .from("subscription_orders")
      .update({ status: "expired" })
      .eq("id", o.id)
      .eq("status", "unpaid");
    status = "expired";
  }

  const out = status === "paid" ? "paid" : status === "expired" || status === "failed" ? "expired" : "pending";
  return NextResponse.json({
    status: out,
    licenseKey: status === "paid" ? (o.license_key ?? null) : null,
    kind: o.kind ?? "new",
    // For kind='renewal': the new expiry stamped by the webhook once renew_license succeeds. Null
    // while unpaid OR when the renew RPC is still pending/retriable — the POS keeps polling.
    renewedUntil: status === "paid" ? (o.renewed_until ?? null) : null,
  });
}
