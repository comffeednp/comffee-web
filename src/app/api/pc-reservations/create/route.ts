import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { guardMutating } from "@/lib/security";
import { isRateAvailableNow, computeRateTotals } from "@/lib/branch-rates";

export const runtime = "nodejs";

const schema = z.object({
  branchId: z.string().uuid(),
  stationName: z.string().min(1).max(40),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional().or(z.literal("")),
  customerType: z.enum(["walk_in", "member"]),
  memberNumber: z.string().max(60).optional().or(z.literal("")),
  rateId: z.string().uuid().optional().or(z.literal("")),
  quantity: z.number().int().min(1).max(12).optional(),
});

const GRACE_MINUTES = 30;          // existing arrival window (after payment is verified)
const PAYMENT_HOLD_MINUTES = 5;    // Stage 7a: window for customer to pay via GCash QR
                                   // (any "now-only" booking auto-cancels if not claim_paid in 5 min)

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

  if (v.customerType === "member" && !v.memberNumber) {
    return NextResponse.json({ error: "member_number_required" }, { status: 400 });
  }
  if (v.customerType === "walk_in" && !v.rateId) {
    return NextResponse.json({ error: "rate_required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verify branch is a reservable type (cafe or partner_cafe) AND the owner has enabled online
  // reservations (Stage 6 toggle in the POS Reservation tab). When the toggle is off, customers
  // see "walk-in only" on the public page; this guard catches any deep-link bypass attempts.
  // P2P removed (2026-05-28) — we only check the QR exists. Any uploaded QR is treated as Business.
  const { data: branch } = await supabase
    .from("branches")
    .select("id, type, name, reservations_enabled, gcash_qr_url")
    .eq("id", v.branchId)
    .maybeSingle();
  if (!branch || (branch.type !== "cafe" && branch.type !== "partner_cafe")) {
    return NextResponse.json({ error: "branch_not_reservable" }, { status: 400 });
  }
  if (!branch.reservations_enabled) {
    return NextResponse.json({ error: "reservations_disabled" }, { status: 403 });
  }
  if (!branch.gcash_qr_url) {
    return NextResponse.json({ error: "branch_payment_not_ready" }, { status: 503 });
  }

  // Verify station exists + is VACANT right now
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

  // Make sure no other pending reservation is holding this station right now
  const { data: existingHold } = await supabase
    .from("pc_reservations")
    .select("id")
    .eq("branch_id", v.branchId)
    .eq("station_name", v.stationName)
    .in("status", ["pending", "acknowledged"]);
  if (existingHold && existingHold.length > 0) {
    return NextResponse.json({ error: "station_already_reserved" }, { status: 409 });
  }

  // Rate validation (walk-in only)
  let totalPhp: number | null = null;
  let totalMinutes = 60;
  let rateRowId: string | null = null;
  if (v.customerType === "walk_in") {
    const { data: rate } = await supabase
      .from("branch_rates")
      .select(
        "id, branch_id, price_php, unit, duration_minutes, pc_tier, time_window_start, time_window_end, is_reservable_online",
      )
      .eq("id", v.rateId!)
      .maybeSingle();
    if (!rate || rate.branch_id !== v.branchId) {
      return NextResponse.json({ error: "rate_not_found" }, { status: 400 });
    }
    if (!rate.is_reservable_online) {
      return NextResponse.json({ error: "rate_not_reservable" }, { status: 400 });
    }
    // Tier match: rate's pc_tier must be null (any) or match station's tier
    if (
      rate.pc_tier &&
      station.pc_tier &&
      rate.pc_tier !== station.pc_tier
    ) {
      return NextResponse.json({ error: "rate_tier_mismatch" }, { status: 400 });
    }
    // Time window check (night promos)
    if (!isRateAvailableNow(rate)) {
      return NextResponse.json({ error: "rate_outside_time_window" }, { status: 400 });
    }
    const totals = computeRateTotals(
      {
        price_php: Number(rate.price_php),
        duration_minutes: rate.duration_minutes,
        unit: rate.unit,
      },
      v.quantity ?? 1,
    );
    totalPhp = totals.totalPhp;
    totalMinutes = totals.totalMinutes;
    rateRowId = rate.id;
  }

  const now = new Date();
  const startIso = now.toISOString();
  const endIso = new Date(now.getTime() + totalMinutes * 60 * 1000).toISOString();
  const mustHonorBy = new Date(now.getTime() + GRACE_MINUTES * 60 * 1000).toISOString();
  // Stage 7a: 5-minute payment hold. After this expires without 'claim_paid', a background sweep
  // (or check-on-read) flips status='expired'. Computed alongside must_honor_by so a single insert
  // captures both windows up front.
  const paymentHoldExpiresAt = new Date(now.getTime() + PAYMENT_HOLD_MINUTES * 60 * 1000).toISOString();

  const { data: created, error: insertErr } = await supabase
    .from("pc_reservations")
    .insert({
      branch_id: v.branchId,
      station_name: v.stationName,
      customer_name: v.customerName,
      customer_phone: v.customerPhone || null,
      customer_type: v.customerType,
      member_number: v.customerType === "member" ? v.memberNumber || null : null,
      rate_id: rateRowId,
      rate_quantity: v.customerType === "walk_in" ? v.quantity ?? 1 : 1,
      total_php: totalPhp,
      reserved_for_start: startIso,
      reserved_for_end: endIso,
      duration_minutes: totalMinutes,
      must_honor_by: mustHonorBy,
      status: "pending",
      payment_status: "unpaid",
      payment_hold_expires_at: paymentHoldExpiresAt,
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    console.error("pc reservation insert failed", insertErr?.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reservationId: created.id });
}
