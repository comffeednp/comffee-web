import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getBranchPaymentConfig } from "@/lib/branch-payment-config";
import { buildDynamicQrphTlv } from "@/lib/qrph";
import { claimPaySlot } from "@/lib/reservation-pay-queue";

export const runtime = "nodejs";

// DIY-QR reservation pay status — polled by the confirmed page every few seconds. It also DRIVES the
// pay queue: a 'queued' booking tries to claim the active slot for its amount on each poll, and an
// 'awaiting' booking whose window lapsed is expired (freeing the slot). When 'awaiting', it returns the
// EMVCo qrString to render. When the POS flips it to 'paid', it returns the unlock/lookup code.
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
      "id, branch_id, total_php, payment_status, payment_hold_expires_at, reservation_code, station_name, customer_email",
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

  // Drive the queue on each poll.
  if (payStatus === "queued") {
    try {
      payStatus = await claimPaySlot(r.id, r.branch_id, Number(r.total_php));
    } catch {
      /* keep 'queued'; the next poll retries */
    }
  } else if (
    payStatus === "awaiting" &&
    r.payment_hold_expires_at &&
    new Date(r.payment_hold_expires_at).getTime() < Date.now()
  ) {
    await admin
      .from("pc_reservations")
      .update({ payment_status: "expired" })
      .eq("id", r.id)
      .eq("payment_status", "awaiting");
    payStatus = "expired";
  }

  // When it's the customer's turn, build the QR + report the (possibly just-refreshed) window expiry.
  let windowExpiresAt = r.payment_hold_expires_at as string | null;
  let qrString: string | null = null;
  if (payStatus === "awaiting") {
    const { data: fresh } = await admin
      .from("pc_reservations")
      .select("payment_hold_expires_at")
      .eq("id", r.id)
      .maybeSingle();
    windowExpiresAt = (fresh?.payment_hold_expires_at as string) ?? windowExpiresAt;
    try {
      const cfg = await getBranchPaymentConfig(r.branch_id);
      if (cfg?.booking_qr_tlv) {
        qrString = buildDynamicQrphTlv(cfg.booking_qr_tlv, Number(r.total_php));
      }
    } catch {
      /* QR build failed → client shows a "pay at the counter" fallback */
    }
  }

  return NextResponse.json({
    ok: true,
    paymentStatus: payStatus, // 'queued' | 'awaiting' | 'paid' | 'expired'
    totalPhp: Number(r.total_php),
    stationName: r.station_name,
    windowExpiresAt: payStatus === "awaiting" ? windowExpiresAt : null,
    qrString, // EMVCo string (only when awaiting) — the client renders the QR with qrcode.react
    reservationCode: payStatus === "paid" ? r.reservation_code : null,
  });
}
