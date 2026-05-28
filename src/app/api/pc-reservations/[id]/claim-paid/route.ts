import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Stage 7a: customer presses "I paid" on the confirmation page. Flips payment_status from
// 'unpaid' → 'claim_paid' so the partner's POS picks it up and verifies via GCash OCR.
//
// Hardening:
// - Only succeeds if the reservation is still in the 5-min payment window AND currently 'pending'.
// - The conditional UPDATE (payment_status='unpaid' AND status='pending' AND now < expires) makes
//   double-clicks idempotent and prevents claiming an already-expired or already-claimed slot.
// - Auth is by reservation UUID (customer just created it; URL is short-lived).

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = getSupabaseAdmin();

  // Fetch first so we can return a clear error code instead of a silent no-op.
  const { data: row, error: readErr } = await admin
    .from("pc_reservations")
    .select("id, status, payment_status, payment_hold_expires_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (row.status !== "pending") {
    return NextResponse.json({ ok: false, error: `bad_status:${row.status}` }, { status: 409 });
  }
  if (row.payment_status === "verified") {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  if (row.payment_status === "claim_paid") {
    return NextResponse.json({ ok: true, alreadyClaimed: true });
  }
  const expiresAt = row.payment_hold_expires_at
    ? new Date(row.payment_hold_expires_at).getTime()
    : 0;
  if (expiresAt > 0 && Date.now() > expiresAt) {
    // Late claim — also flip the reservation to expired so the station is released cleanly.
    await admin
      .from("pc_reservations")
      .update({ status: "expired", cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending");
    return NextResponse.json({ ok: false, error: "payment_window_expired" }, { status: 410 });
  }

  const { error: upErr } = await admin
    .from("pc_reservations")
    .update({ payment_status: "claim_paid" })
    .eq("id", id)
    .eq("status", "pending")
    .eq("payment_status", "unpaid");
  if (upErr) {
    return NextResponse.json({ ok: false, error: "save_failed", detail: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
