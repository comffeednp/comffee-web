/**
 * Playcation booking pricing — the single source of truth for how a stay is
 * charged. Both the booking UI (BookingClient) and the server (create-intent)
 * import these so the price shown can never drift from the price charged.
 *
 * Everything here is a pure function of its inputs (no DB, no clock except the
 * `nowMs` you pass in) so it is exhaustively unit-tested in booking-pricing.test.ts.
 *
 * Money is in whole pesos. The 30% scheme: charge ceil(30%) of the accommodation
 * now, the remainder is the balance due 3 days before check-in. The refundable
 * security deposit and the processing fee are always charged up front.
 */

import { addDays } from "@/lib/dates";

export const RESERVATION_FEE_RATE = 0.3;
/** The balance is due this many days before check-in. */
export const BALANCE_LEAD_DAYS = 3;

/** The date (YYYY-MM-DD) the 70% balance is due — BALANCE_LEAD_DAYS before check-in. */
export function balanceDueDateFor(checkIn: string): string {
  return addDays(checkIn, -BALANCE_LEAD_DAYS);
}

/** Today's date (YYYY-MM-DD) in Philippine time, derived from a UTC epoch ms. */
export function phToday(nowMs: number): string {
  return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Whether the 30% option may be offered: the balance due date must be at least
 * two days out, so there is a real window to collect it. Computed on PH calendar
 * dates and compared as strings — identical on client and server.
 */
export function isPartialAllowed(checkIn: string, nowMs: number): boolean {
  return balanceDueDateFor(checkIn) > addDays(phToday(nowMs), 1);
}

export interface ReservationChargeInput {
  /** Accommodation total after any promo discount, in whole pesos. */
  accommodationTotal: number;
  paymentType: "full" | "partial";
  securityDepositPhp: number;
  processingFeePhp: number;
  checkIn: string; // YYYY-MM-DD
  nowMs: number;   // Date.now()
}

export interface ReservationCharge {
  /** Accommodation amount charged now (full total, or the 30% reservation fee). */
  reservationFee: number;
  /** Remaining 70% balance (0 for full payment). */
  balancePhp: number;
  /** When the balance is due, or null for full payment. */
  balanceDueDate: string | null;
  /** Total charged now = reservationFee + deposit + processing fee. */
  dueNow: number;
  /** Full booking value = accommodation + deposit + processing fee. */
  total: number;
  /** Whether a partial payment is permitted for this check-in date. */
  partialAllowed: boolean;
}

/**
 * Compute the charge for a reservation. Honours the literal `paymentType`
 * (it does NOT silently downgrade a disallowed partial) and exposes
 * `partialAllowed` so the caller decides: the server rejects a disallowed
 * partial; the client collapses a stale partial to full before it ever submits.
 */
export function computeReservationCharge(input: ReservationChargeInput): ReservationCharge {
  const accommodationTotal = Math.max(0, input.accommodationTotal);
  const partialAllowed = isPartialAllowed(input.checkIn, input.nowMs);
  const isPartial = input.paymentType === "partial";

  const reservationFee = isPartial
    ? Math.ceil(accommodationTotal * RESERVATION_FEE_RATE)
    : accommodationTotal;
  const balancePhp = isPartial ? accommodationTotal - reservationFee : 0;
  const balanceDueDate = isPartial ? balanceDueDateFor(input.checkIn) : null;
  const dueNow = reservationFee + input.securityDepositPhp + input.processingFeePhp;
  const total = accommodationTotal + input.securityDepositPhp + input.processingFeePhp;

  return { reservationFee, balancePhp, balanceDueDate, dueNow, total, partialAllowed };
}
