/**
 * Reservation helpers — soft-hold creation, availability checks, confirmation.
 *
 * The single `reservations` table holds website bookings, Airbnb-imported blocks,
 * and manual blocks. The Postgres GIST exclusion constraint
 * (see migration 0001) makes overlapping confirmed/held rows mathematically
 * impossible — so the only thing we have to handle ourselves is graceful
 * failure when the constraint fires.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReservationStatus } from "@/lib/supabase/types";
import { nightsBetween } from "@/lib/dates";
import { computeAccommodation } from "@/lib/booking-pricing";
import { sendBookingConfirmation } from "@/lib/email";
import { listInstructionPhotos } from "@/lib/branch-instructions";

const HOLD_WINDOW_MINUTES = 20;

export interface AvailabilityCheck {
  available: boolean;
  conflicts: Array<{ check_in: string; check_out: string; source: string }>;
}

/** Check if a date range is free for the given branch (excludes a soft-hold ID if provided). */
export async function checkAvailability(
  branchId: string,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: string,
): Promise<AvailabilityCheck> {
  if (nightsBetween(checkIn, checkOut) < 1) {
    return { available: false, conflicts: [] };
  }
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("reservations")
    .select("id, check_in, check_out, source, status, hold_expires_at")
    .eq("branch_id", branchId)
    // pending_approval = paid request waiting for the owner; it holds the dates
    // exactly like a confirmed booking so no one else can grab them meanwhile.
    .in("status", ["pending_hold", "pending_approval", "confirmed"])
    // overlap test: existing.check_in < new.check_out AND existing.check_out > new.check_in
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);
  if (excludeReservationId) q = q.neq("id", excludeReservationId);

  const { data, error } = await q;
  if (error) {
    throw new Error(`availability check failed: ${error.message}`);
  }

  const now = new Date().getTime();
  const realConflicts = (data ?? []).filter((r) => {
    // Treat expired holds as gone
    if (r.status === "pending_hold" && r.hold_expires_at) {
      const exp = new Date(r.hold_expires_at).getTime();
      if (exp < now) return false;
    }
    return true;
  });

  return {
    available: realConflicts.length === 0,
    conflicts: realConflicts.map((c) => ({
      check_in: c.check_in,
      check_out: c.check_out,
      source: c.source,
    })),
  };
}

export interface CreateHoldInput {
  branchId: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  numGuests?: number;
  totalPhp: number;
  securityDepositPhp?: number;
  paymentType?: "full" | "partial";
  balancePhp?: number;
  balanceDueDate?: string;
  memberId?: string;
  kycSelfieUrl?: string;
  kycIdUrl?: string;
  kycBillingUrl?: string;
  kycIpAddress?: string;
  kycLatitude?: number;
  kycLongitude?: number;
}

export interface CreatedHold {
  id: string;
  hold_expires_at: string;
}

/**
 * Create a soft-hold reservation. Returns the new row's id + expiry.
 * The Postgres GIST exclusion constraint will reject the insert if there's
 * a conflict — we surface that as a clear error for the caller.
 */
export async function createHold(input: CreateHoldInput): Promise<CreatedHold> {
  const supabase = getSupabaseAdmin();

  // An expired hold still blocks the database overlap constraint until the
  // cleanup cron runs (every 5 min). So a slot that's really free can wrongly
  // reject a new booking with a "dates taken" error during that window. Release
  // any expired holds overlapping these dates first to close that gap.
  await supabase
    .from("reservations")
    .update({ status: "cancelled", notes: "auto-released: hold expired (pre-booking sweep)" })
    .eq("branch_id", input.branchId)
    .eq("status", "pending_hold")
    .lt("hold_expires_at", new Date().toISOString())
    .lt("check_in", input.checkOut)
    .gt("check_out", input.checkIn);

  const expiresAt = new Date(
    Date.now() + HOLD_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      branch_id: input.branchId,
      source: "website",
      status: "pending_hold",
      check_in: input.checkIn,
      check_out: input.checkOut,
      guest_name: input.guestName,
      guest_email: input.guestEmail ?? null,
      guest_phone: input.guestPhone ?? null,
      num_guests: input.numGuests ?? 1,
      total_php: input.totalPhp,
      security_deposit_php: input.securityDepositPhp ?? 0,
      payment_type: input.paymentType ?? "full",
      balance_php: input.balancePhp ?? 0,
      balance_due_date: input.balanceDueDate ?? null,
      member_id: input.memberId ?? null,
      kyc_selfie_url: input.kycSelfieUrl ?? null,
      kyc_id_url: input.kycIdUrl ?? null,
      kyc_billing_url: input.kycBillingUrl ?? null,
      kyc_ip_address: input.kycIpAddress ?? null,
      kyc_latitude: input.kycLatitude ?? null,
      kyc_longitude: input.kycLongitude ?? null,
      hold_expires_at: expiresAt,
    })
    .select("id, hold_expires_at")
    .single();

  if (error) {
    if (
      error.message.includes("reservations_no_overlap") ||
      error.code === "23P01"
    ) {
      throw new Error("CONFLICT: those dates were just taken — try different dates");
    }
    throw new Error(`hold create failed: ${error.message}`);
  }
  return data as CreatedHold;
}

/** Mark a reservation as confirmed (called from PayMongo webhook). */
export async function confirmReservation(reservationId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("reservations")
    .update({
      status: "confirmed" as ReservationStatus,
      hold_expires_at: null,
    })
    .eq("id", reservationId);
  if (error) throw new Error(`confirm failed: ${error.message}`);
}

/**
 * Request-to-book: when payment lands, the booking does NOT confirm — it waits
 * for the owner to accept/reject. We stamp approval_requested_at (the 24h
 * auto-reject timer counts from here) and keep the PayMongo payment id so a
 * reject can refund it.
 */
export async function requestApproval(reservationId: string, paymentId?: string) {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {
    status: "pending_approval" as ReservationStatus,
    hold_expires_at: null,
    approval_requested_at: new Date().toISOString(),
  };
  if (paymentId) patch.paymongo_payment_id = paymentId;
  const { error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId);
  if (error) throw new Error(`requestApproval failed: ${error.message}`);
}

/**
 * Playcation INSTANT-CONFIRM on payment. Playcation venues do NOT use the
 * request-to-book / host-approval step — that's an internet-cafe behaviour (owner
 * 2026-06-15: "approval only should be for internet cafes, not a playcation branch").
 * Flips a paid hold straight to confirmed, records the payment, and sends the SAME
 * booking-confirmation email the owner's Accept used to send. Idempotent: only acts
 * on a row still pending_hold/pending_approval, so a duplicate webhook can't
 * double-send. Returns false if nothing flipped (already handled).
 */
export async function confirmPaidReservation(
  reservationId: string,
  paymentId?: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {
    status: "confirmed" as ReservationStatus,
    payment_status: "paid",
    hold_expires_at: null,
    approval_requested_at: null,
  };
  if (paymentId) patch.paymongo_payment_id = paymentId;
  const { data, error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId)
    .in("status", ["pending_hold", "pending_approval"])
    .select(
      "guest_email, guest_name, num_guests, total_php, check_in, check_out, branch_id, payment_type, balance_php, balance_due_date",
    );
  if (error) throw new Error(`confirmPaidReservation failed: ${error.message}`);
  const r = data && data[0];
  if (!r) return false; // already handled / not in a confirmable state

  // Booking confirmation email (best effort — never block the webhook on email).
  if (r.guest_email && r.branch_id) {
    try {
      const { data: branch } = await supabase
        .from("branches")
        .select("name, slug, address, branch_rates (check_in_time, check_out_time, sort_order)")
        .eq("id", r.branch_id)
        .maybeSingle();
      const rates = (
        (branch as { branch_rates?: Array<{ check_in_time: string | null; check_out_time: string | null; sort_order: number }> } | null)
          ?.branch_rates ?? []
      ).sort((a, b) => a.sort_order - b.sort_order);
      const rateWithTime = rates.find((x) => x.check_in_time);
      await sendBookingConfirmation({
        to: r.guest_email,
        guestName: r.guest_name ?? "there",
        branchName: (branch as { name?: string } | null)?.name ?? "Comffee Playcation",
        branchSlug: (branch as { slug?: string } | null)?.slug ?? "",
        branchAddress: (branch as { address?: string | null } | null)?.address ?? null,
        checkIn: r.check_in,
        checkOut: r.check_out,
        checkInTime: rateWithTime?.check_in_time ?? null,
        checkOutTime: rateWithTime?.check_out_time ?? null,
        numGuests: r.num_guests ?? 1,
        totalPhp: Number(r.total_php ?? 0),
        balancePhp: r.payment_type === "partial" ? Number(r.balance_php ?? 0) : 0,
        balanceDueDate: r.payment_type === "partial" ? (r.balance_due_date ?? null) : null,
        reservationId,
        instructionPhotos: (await listInstructionPhotos(r.branch_id)).map((p) => ({
          label: p.label,
          url: p.signedUrl,
        })),
      });
    } catch (e) {
      console.error("[email] confirmation failed", e);
    }
  }
  return true;
}

/**
 * Owner accepts a waiting request → confirmed. Guarded to only flip a row that
 * is STILL pending_approval, so it's idempotent and can't accept a request the
 * 24h sweep (or a prior click) already rejected. Returns false if nothing flipped.
 */
export async function acceptReservation(reservationId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "confirmed" as ReservationStatus, hold_expires_at: null })
    .eq("id", reservationId)
    .eq("status", "pending_approval")
    .select("id");
  if (error) throw new Error(`accept failed: ${error.message}`);
  return !!(data && data.length > 0);
}

/** Cancel a reservation (admin action or webhook on payment failure). */
export async function cancelReservation(reservationId: string, reason?: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("reservations")
    .update({
      status: "cancelled" as ReservationStatus,
      hold_expires_at: null,
      notes: reason ?? null,
    })
    .eq("id", reservationId);
  if (error) throw new Error(`cancel failed: ${error.message}`);
}

/** Set the PayMongo intent ID on a reservation (after we've created the link). */
export async function attachPaymentIntent(
  reservationId: string,
  paymongoIntentId: string,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("reservations")
    .update({ paymongo_intent_id: paymongoIntentId })
    .eq("id", reservationId);
  if (error) throw new Error(`attach intent failed: ${error.message}`);
}

/** Look up a reservation by id (admin context — uses service role). */
export async function getReservationById(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select("*, branch:branches(id, slug, name, type, hero_image_url)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Look up a reservation by PayMongo intent ID (used in webhook). */
export async function getReservationByIntent(intentId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("paymongo_intent_id", intentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Set the PayMongo intent ID for the *balance* payment (partial scheme). */
export async function attachBalanceIntent(
  reservationId: string,
  paymongoIntentId: string,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("reservations")
    .update({ balance_paymongo_intent_id: paymongoIntentId })
    .eq("id", reservationId);
  if (error) throw new Error(`attach balance intent failed: ${error.message}`);
}

/** Look up a reservation by its *balance* PayMongo intent ID (used in webhook). */
export async function getReservationByBalanceIntent(intentId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("balance_paymongo_intent_id", intentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Mark the partial-payment balance as paid (called from PayMongo webhook). */
export async function markBalancePaid(reservationId: string, paymentId?: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("reservations")
    .update({
      balance_paid_at: new Date().toISOString(),
      balance_paymongo_payment_id: paymentId ?? null,
    })
    .eq("id", reservationId);
  if (error) throw new Error(`mark balance paid failed: ${error.message}`);
}

/** Compute the total for a Playcation booking based on branch rates, nights, and guest count. */
export async function computePlaycationTotal(
  branchId: string,
  nights: number,
  numGuests = 1,
): Promise<number> {
  if (nights < 1) return 0;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("branch_rates")
    .select("price_php, unit, sort_order, category, max_pax, extra_pax_fee_php")
    .eq("branch_id", branchId)
    .order("sort_order", { ascending: true });

  const rates = (data ?? []) as Array<{
    price_php: number;
    unit: string;
    sort_order: number;
    category: string;
    max_pax: number | null;
    extra_pax_fee_php: number | null;
  }>;
  const nightly = rates.find((r) => r.unit === "night") ?? rates[0];
  if (!nightly) return 0;

  // Shared with the booking UI so client display and server charge can't diverge.
  return computeAccommodation({
    nightlyRatePhp: Number(nightly.price_php),
    nights,
    numGuests,
    maxPax: nightly.max_pax ?? null,
    extraPaxFeePhp: nightly.extra_pax_fee_php ?? null,
  }).subtotal;
}
