import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Stage 7b: cashier in the POS clicks "Verify" after spotting the customer's GCash receipt
// in their inbox. Flips payment_status to 'verified' AND status to 'acknowledged' (the cashier
// has "seen" the reservation and accepted the payment). Bearer-token auth — POS uses the
// service-role key it already has. Stage 7c will add OCR auto-match (incoming GCash receipt
// amount → claim_paid reservation) calling this same endpoint server-side.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("pc_reservations")
    .select("status, payment_status")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Idempotency: already verified → success no-op (handy if the customer-side poller raced).
  if (row.payment_status === "verified" && row.status === "acknowledged") {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  if (row.status !== "pending") {
    return NextResponse.json({ ok: false, error: `bad_status:${row.status}` }, { status: 409 });
  }
  if (row.payment_status !== "claim_paid" && row.payment_status !== "unpaid") {
    return NextResponse.json({ ok: false, error: `bad_payment:${row.payment_status}` }, { status: 409 });
  }

  const { error: upErr } = await admin
    .from("pc_reservations")
    .update({
      payment_status: "verified",
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  if (upErr) {
    return NextResponse.json({ ok: false, error: "save_failed", detail: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
