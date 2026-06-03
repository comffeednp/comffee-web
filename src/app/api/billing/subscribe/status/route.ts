import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Polled by the POS onboarding while the QR is on screen. Reports the order state and, once paid +
// minted, hands back the license key so the POS can auto-activate. The PayMongo webhook is what
// flips the order to 'paid' and stamps the minted key — this route only reports.
//   -> { status: 'pending' | 'paid' | 'expired', licenseKey: string | null }
const HOLD_MINUTES = 20;

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!ref) return NextResponse.json({ error: "missing_ref" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: o } = await admin
    .from("subscription_orders")
    .select("id, status, license_key, created_at")
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
  });
}
