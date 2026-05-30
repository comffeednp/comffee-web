import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { guardMutating } from "@/lib/security";
import { isRateAvailableNow, computeRateTotals } from "@/lib/branch-rates";
import { getBranchPaymentConfig, isPaymongoReservationActive } from "@/lib/branch-payment-config";
import { claimPaySlot } from "@/lib/reservation-pay-queue";

export const runtime = "nodejs";

const schema = z.object({
  branchId: z.string().uuid(),
  stationName: z.string().min(1).max(40),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional().or(z.literal("")),
  customerType: z.enum(["walk_in", "member"]),
  memberNumber: z.string().max(60).optional().or(z.literal("")),
  memberTopup: z.number().positive().max(100000).optional(),
  memberFirstName: z.string().max(80).optional().or(z.literal("")),
  memberLastName: z.string().max(80).optional().or(z.literal("")),
  rateId: z.string().uuid().optional().or(z.literal("")),
  quantity: z.number().int().min(1).max(12).optional(),
});

// Flat reservation fee (flowchart §E/§F/§G). Hardcoded so the website + POS can never drift.
const RESERVATION_FEE_PHP = 10;

// Cafe reservations get a 10-MINUTE arrival grace (flowchart §F), separate from the OLD Playcation
// 30-min grace. The PAYMENT window (how long the QR stays live) is the queue's 5 min, set on the POS
// side by claimPaySlot — not here.
const CAFE_GRACE_MINUTES = 10;

/** 6-char uppercase code (no ambiguous 0/O/1/I) — the customer's UNLOCK code + the cashier lookup. */
function makeReservationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "pc-reservations-create",
    limit: 5,
    windowMs: 10 * 60 * 1000,
    maxBytes: 4 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }
  const v = parsed.data;

  // Google sign-in is REQUIRED to reserve (flowchart §F/§G/§K). Re-check server-side so a direct POST
  // can't bypass the UI gate; stamp the signed-in email onto the reservation.
  const supaUser = await getSupabaseServer();
  const {
    data: { user },
  } = await supaUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  const signedInEmail = (user.email ?? "").toLowerCase() || null;

  if (v.customerType === "member" && !v.memberNumber) {
    return NextResponse.json({ error: "member_number_required" }, { status: 400 });
  }
  if (v.customerType === "walk_in" && !v.rateId) {
    return NextResponse.json({ error: "rate_required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Branch must be a reservable cafe type. (Playcation books elsewhere.)
  const { data: branch } = await supabase
    .from("branches")
    .select("id, type, name, slug")
    .eq("id", v.branchId)
    .maybeSingle();
  if (!branch || (branch.type !== "cafe" && branch.type !== "partner_cafe")) {
    return NextResponse.json({ error: "branch_not_reservable" }, { status: 400 });
  }

  // GATE: online reservations require the owner's active method to be PayMongo AND a synced Bookings QR
  // (DIY-QR flow — the website builds the QR from it; the POS confirms by watching PayMongo). Read the
  // full config (server-side, service role); we only ever send non-secret fields to the client.
  const config = await getBranchPaymentConfig(v.branchId);
  if (!isPaymongoReservationActive(config)) {
    return NextResponse.json({ error: "reservations_not_available" }, { status: 403 });
  }
  const reservationMinHours = Number(config!.reservation_min_hours ?? 1);
  const reservationMinTopup = Number(config!.reservation_min_topup ?? 0);

  // Station must exist + be vacant right now.
  const { data: station } = await supabase
    .from("pc_stations")
    .select("id, station_name, is_occupied, pc_tier")
    .eq("branch_id", v.branchId)
    .eq("station_name", v.stationName)
    .maybeSingle();
  if (!station) {
    return NextResponse.json({ error: "station_not_found" }, { status: 400 });
  }
  if (station.is_occupied) {
    return NextResponse.json({ error: "station_occupied" }, { status: 409 });
  }

  // No other live hold on this station (anyone queued/awaiting/paid-pending counts).
  const { data: existingHold } = await supabase
    .from("pc_reservations")
    .select("id")
    .eq("branch_id", v.branchId)
    .eq("station_name", v.stationName)
    .in("status", ["pending", "acknowledged"]);
  if (existingHold && existingHold.length > 0) {
    return NextResponse.json({ error: "station_already_reserved" }, { status: 409 });
  }

  // ---- Amount + time, per customer type -----------------------------------------------------
  let pcTimePhp = 0; // walk-in PC-time portion (member = 0; their money is the top-up)
  let memberTopupPhp = 0; // member top-up portion
  let totalMinutes = 60; // session length recorded on the reservation
  let rateRowId: string | null = null;

  if (v.customerType === "walk_in") {
    const { data: rate } = await supabase
      .from("branch_rates")
      .select(
        "id, branch_id, label, price_php, unit, duration_minutes, pc_tier, time_window_start, time_window_end, is_reservable_online",
      )
      .eq("id", v.rateId!)
      .maybeSingle();
    if (!rate || rate.branch_id !== v.branchId) {
      return NextResponse.json({ error: "rate_not_found" }, { status: 400 });
    }
    if (!rate.is_reservable_online) {
      return NextResponse.json({ error: "rate_not_reservable" }, { status: 400 });
    }
    if (rate.pc_tier && station.pc_tier && rate.pc_tier !== station.pc_tier) {
      return NextResponse.json({ error: "rate_tier_mismatch" }, { status: 400 });
    }
    if (!isRateAvailableNow(rate)) {
      return NextResponse.json({ error: "rate_outside_time_window" }, { status: 400 });
    }
    const totals = computeRateTotals(
      { price_php: Number(rate.price_php), duration_minutes: rate.duration_minutes, unit: rate.unit },
      v.quantity ?? 1,
    );
    if (totals.totalMinutes / 60 < reservationMinHours) {
      return NextResponse.json({ error: "below_min_hours" }, { status: 400 });
    }
    pcTimePhp = totals.totalPhp;
    totalMinutes = totals.totalMinutes;
    rateRowId = rate.id;
  } else {
    const topup = v.memberTopup ?? 0;
    if (!topup || topup <= 0) {
      return NextResponse.json({ error: "topup_required" }, { status: 400 });
    }
    if (topup < reservationMinTopup) {
      return NextResponse.json({ error: "below_min_topup" }, { status: 400 });
    }
    memberTopupPhp = topup;
  }

  // What the customer pays online = flat fee + (PC time | top-up). NO unique-centavo (owner 2026-05-30);
  // the pay QUEUE keeps same-amount payments unambiguous instead.
  const amountPhp = RESERVATION_FEE_PHP + pcTimePhp + memberTopupPhp;

  const now = new Date();
  const startIso = now.toISOString();
  const endIso = new Date(now.getTime() + totalMinutes * 60 * 1000).toISOString();
  const mustHonorBy = new Date(now.getTime() + CAFE_GRACE_MINUTES * 60 * 1000).toISOString();
  const reservationCode = makeReservationCode();

  // Insert as 'queued' (waiting for the same-amount pay slot). status='pending' so the POS pop-up picks
  // it up once the POS flips payment_status to 'paid'. One retry covers the astronomically rare code clash.
  const baseRow = {
    branch_id: v.branchId,
    station_name: v.stationName,
    customer_name: v.customerName,
    customer_phone: v.customerPhone || null,
    customer_email: signedInEmail,
    customer_type: v.customerType,
    member_number: v.customerType === "member" ? v.memberNumber || null : null,
    member_first_name: v.customerType === "member" ? v.memberFirstName || null : null,
    member_last_name: v.customerType === "member" ? v.memberLastName || null : null,
    member_topup: memberTopupPhp,
    rate_id: rateRowId,
    rate_quantity: v.customerType === "walk_in" ? v.quantity ?? 1 : 1,
    total_php: amountPhp,
    service_fee: RESERVATION_FEE_PHP,
    reserved_for_start: startIso,
    reserved_for_end: endIso,
    duration_minutes: totalMinutes,
    must_honor_by: mustHonorBy,
    status: "pending" as const,
    payment_status: "queued" as const,
  };

  async function insertOnce(code: string) {
    return supabase
      .from("pc_reservations")
      .insert({ ...baseRow, reservation_code: code })
      .select("id")
      .single();
  }

  let code = reservationCode;
  let { data: created, error: insertErr } = await insertOnce(code);
  if (insertErr?.code === "23505") {
    code = makeReservationCode();
    ({ data: created, error: insertErr } = await insertOnce(code));
  }
  if (insertErr || !created) {
    console.error("pc reservation insert failed", insertErr?.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Try to grab the active pay slot for this amount right away. If another booking of the EXACT same
  // total is mid-payment, this stays 'queued' and the confirmed page keeps trying until it's our turn.
  // Fail-soft: even if the claim hiccups, the reservation exists and the confirmed page will retry.
  try {
    await claimPaySlot(created.id, v.branchId, amountPhp);
  } catch (e) {
    console.error("claimPaySlot failed (non-fatal)", e instanceof Error ? e.message : e);
  }

  // The client navigates to /reserve-pc/confirmed/<id>, which polls pay-status (claim/QR/code/paid).
  return NextResponse.json({ ok: true, reservationId: created.id, reservationCode: code });
}
