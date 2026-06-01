import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Reservation pay status — polled by the confirmed page every few seconds while the customer is on
// PayMongo's hosted checkout (or just back from it). PayMongo's webhook is what flips payment_status to
// 'paid' (and stamps the code); this route only REPORTS the current state. The DIY-QR queue + EMVCo QR
// build were removed (2026-06-01) — bookings now pay on PayMongo's hosted page, so there's no QR to
// draw and no same-amount slot to serialize.
//
// Reported payment_status: 'unpaid' (still paying) | 'paid' | 'expired'.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Sign-in + ownership: only the customer who booked (same Google account) may read it.
  const supaUser = await getSupabaseServer();
  const {
    data: { user },
  } = await supaUser.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: r } = await admin
    .from("pc_reservations")
    .select(
      "id, total_php, payment_status, reservation_code, station_name, customer_email, status, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if ((r.customer_email ?? "").toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payStatus = r.payment_status as string;

  // Self-expire a stale UNPAID hold (bug fix 2026-06-01, must match create-route's UNPAID_HOLD_MINUTES).
  // Without this, a customer who never finishes paying would see "Waiting for your payment…" forever AND
  // keep the seat held until someone ELSE tries to book it. Expiring here frees the seat on the
  // customer's own polling and flips their page to the "rebook" screen. Race-safe: the .eq guards only
  // flip a row that's still pending+unpaid (a webhook that just marked it paid wins).
  const UNPAID_HOLD_MINUTES = 5;
  if (
    payStatus === "unpaid" &&
    r.status === "pending" &&
    r.created_at &&
    Date.now() - new Date(r.created_at as string).getTime() > UNPAID_HOLD_MINUTES * 60 * 1000
  ) {
    await admin
      .from("pc_reservations")
      .update({ status: "expired", payment_status: "expired" })
      .eq("id", r.id)
      .eq("status", "pending")
      .eq("payment_status", "unpaid");
    payStatus = "expired";
  }

  return NextResponse.json({
    ok: true,
    paymentStatus: payStatus, // 'unpaid' | 'paid' | 'expired'
    totalPhp: Number(r.total_php),
    stationName: r.station_name,
    reservationCode: payStatus === "paid" ? r.reservation_code : null,
  });
}
