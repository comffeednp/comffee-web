import { describe, it, expect } from "vitest";
import {
  balanceDueDateFor,
  isPartialAllowed,
  computeReservationCharge,
  phToday,
  splitRefund,
  classifyBalanceSweep,
} from "./booking-pricing";

// Fixed clocks (UTC epoch ms) so the PH-date math is deterministic.
const MID_DAY_PH = Date.UTC(2026, 5, 23, 2, 0, 0); // 2026-06-23 10:00 PH
const LATE_NIGHT_PH = Date.UTC(2026, 5, 23, 23, 0, 0); // 2026-06-24 07:00 PH

const DEPOSIT = 1000;
const FEE = 150;

describe("phToday / balanceDueDateFor", () => {
  it("derives the PH calendar date from a UTC epoch", () => {
    expect(phToday(MID_DAY_PH)).toBe("2026-06-23");
    expect(phToday(LATE_NIGHT_PH)).toBe("2026-06-24"); // crossed PH midnight
  });

  it("balance is due exactly 3 days before check-in", () => {
    expect(balanceDueDateFor("2026-06-28")).toBe("2026-06-25");
    expect(balanceDueDateFor("2026-07-01")).toBe("2026-06-28"); // month boundary
  });
});

describe("isPartialAllowed", () => {
  it("allows partial only when the balance due date is >= 2 days out", () => {
    // now = 2026-06-23 PH → need balanceDue > 2026-06-24
    expect(isPartialAllowed("2026-06-28", MID_DAY_PH)).toBe(true); // due 06-25
    expect(isPartialAllowed("2026-06-27", MID_DAY_PH)).toBe(false); // due 06-24 (== cutoff)
    expect(isPartialAllowed("2026-06-26", MID_DAY_PH)).toBe(false); // due 06-23
  });

  it("uses PH time, not the UTC instant (the bug the client used to have)", () => {
    // At 23:00 UTC it is already the 24th in PH, so 06-28 (due 06-25) is NOT
    // far enough out. Client and server now agree because they share this fn.
    expect(isPartialAllowed("2026-06-28", LATE_NIGHT_PH)).toBe(false);
    expect(isPartialAllowed("2026-06-29", LATE_NIGHT_PH)).toBe(true); // due 06-26
  });
});

describe("computeReservationCharge — full payment", () => {
  const charge = computeReservationCharge({
    accommodationTotal: 3500,
    paymentType: "full",
    securityDepositPhp: DEPOSIT,
    processingFeePhp: FEE,
    checkIn: "2026-06-28",
    nowMs: MID_DAY_PH,
  });

  it("charges the whole accommodation up front, no balance", () => {
    expect(charge.reservationFee).toBe(3500);
    expect(charge.balancePhp).toBe(0);
    expect(charge.balanceDueDate).toBeNull();
    expect(charge.dueNow).toBe(3500 + DEPOSIT + FEE); // 4650
    expect(charge.total).toBe(3500 + DEPOSIT + FEE); // 4650 — dueNow == total
  });
});

describe("computeReservationCharge — 30% partial", () => {
  it("splits 30/70 on the accommodation and adds deposit + fee now", () => {
    const c = computeReservationCharge({
      accommodationTotal: 3500,
      paymentType: "partial",
      securityDepositPhp: DEPOSIT,
      processingFeePhp: FEE,
      checkIn: "2026-06-28",
      nowMs: MID_DAY_PH,
    });
    expect(c.reservationFee).toBe(1050); // ceil(1050)
    expect(c.balancePhp).toBe(2450);
    expect(c.balanceDueDate).toBe("2026-06-25");
    expect(c.dueNow).toBe(1050 + DEPOSIT + FEE); // 2200
    expect(c.total).toBe(3500 + DEPOSIT + FEE); // 4650 — full value
  });

  it("rounds the reservation fee UP (ceil) and the balance is the remainder", () => {
    const c = computeReservationCharge({
      accommodationTotal: 3333,
      paymentType: "partial",
      securityDepositPhp: DEPOSIT,
      processingFeePhp: FEE,
      checkIn: "2026-07-15",
      nowMs: MID_DAY_PH,
    });
    expect(c.reservationFee).toBe(1000); // ceil(999.9)
    expect(c.balancePhp).toBe(2333);
    // Invariant: the two parts always reconstruct the accommodation total.
    expect(c.reservationFee + c.balancePhp).toBe(3333);
  });

  it("reservationFee + balancePhp always equals accommodationTotal", () => {
    for (const accom of [1, 99, 100, 999, 1000, 2999, 3001, 12345]) {
      const c = computeReservationCharge({
        accommodationTotal: accom,
        paymentType: "partial",
        securityDepositPhp: DEPOSIT,
        processingFeePhp: FEE,
        checkIn: "2026-08-01",
        nowMs: MID_DAY_PH,
      });
      expect(c.reservationFee + c.balancePhp).toBe(accom);
      expect(c.reservationFee).toBeGreaterThanOrEqual(Math.floor(accom * 0.3));
    }
  });

  it("computes partial numbers but reports partialAllowed=false when too close (server uses this to reject)", () => {
    const c = computeReservationCharge({
      accommodationTotal: 3500,
      paymentType: "partial",
      securityDepositPhp: DEPOSIT,
      processingFeePhp: FEE,
      checkIn: "2026-06-26", // due 06-23, today is 06-23 → not allowed
      nowMs: MID_DAY_PH,
    });
    expect(c.partialAllowed).toBe(false);
  });
});

describe("splitRefund — admin cancel refunds both payments", () => {
  it("full payment (no balance): refunds the whole initial, nothing on balance", () => {
    expect(splitRefund({ initialPaid: 4650, balancePaid: 0, alreadyRefunded: 0 }))
      .toEqual({ refundInitial: 4650, refundBalance: 0 });
  });

  it("fully-paid 30% booking: refunds BOTH payments in full (the bug this fixes)", () => {
    // 30% fee+deposit+fee = 2200 initial, 70% balance = 2450.
    expect(splitRefund({ initialPaid: 2200, balancePaid: 2450, alreadyRefunded: 0 }))
      .toEqual({ refundInitial: 2200, refundBalance: 2450 });
  });

  it("balance never settled: only the initial payment is refunded", () => {
    expect(splitRefund({ initialPaid: 2200, balancePaid: 0, alreadyRefunded: 0 }))
      .toEqual({ refundInitial: 2200, refundBalance: 0 });
  });

  it("prior refund covers part of the initial: remainder on initial, balance untouched", () => {
    expect(splitRefund({ initialPaid: 2200, balancePaid: 2450, alreadyRefunded: 1000 }))
      .toEqual({ refundInitial: 1200, refundBalance: 2450 });
  });

  it("prior refund spills past the initial into the balance", () => {
    // 3000 already refunded: 2200 fills initial, 800 eats into the 2450 balance.
    expect(splitRefund({ initialPaid: 2200, balancePaid: 2450, alreadyRefunded: 3000 }))
      .toEqual({ refundInitial: 0, refundBalance: 1650 });
  });

  it("already fully refunded (idempotent re-run): refunds nothing", () => {
    expect(splitRefund({ initialPaid: 2200, balancePaid: 2450, alreadyRefunded: 4650 }))
      .toEqual({ refundInitial: 0, refundBalance: 0 });
    expect(splitRefund({ initialPaid: 2200, balancePaid: 2450, alreadyRefunded: 9999 }))
      .toEqual({ refundInitial: 0, refundBalance: 0 });
  });

  it("the split never exceeds what is still owed back", () => {
    for (const already of [0, 500, 2200, 3000, 4650]) {
      const { refundInitial, refundBalance } = splitRefund({
        initialPaid: 2200, balancePaid: 2450, alreadyRefunded: already,
      });
      const stillOwed = Math.max(0, 2200 + 2450 - already);
      expect(refundInitial + refundBalance).toBe(stillOwed);
    }
  });
});

describe("classifyBalanceSweep — forfeit vs remind boundary", () => {
  const today = "2026-06-23";
  const base = { today, remindDaysAhead: 2, reminderAlreadySent: false };

  it("no due date → none", () => {
    expect(classifyBalanceSweep({ ...base, balanceDueDate: null })).toBe("none");
  });

  it("due date already passed → cancel (forfeit)", () => {
    expect(classifyBalanceSweep({ ...base, balanceDueDate: "2026-06-22" })).toBe("cancel");
  });

  it("due today is NOT yet overdue → remind (within window)", () => {
    expect(classifyBalanceSweep({ ...base, balanceDueDate: "2026-06-23" })).toBe("remind");
  });

  it("due at the edge of the reminder window (today+2) → remind", () => {
    expect(classifyBalanceSweep({ ...base, balanceDueDate: "2026-06-25" })).toBe("remind");
  });

  it("due just beyond the window (today+3) → none", () => {
    expect(classifyBalanceSweep({ ...base, balanceDueDate: "2026-06-26" })).toBe("none");
  });

  it("already reminded and still in window → none (don't double-remind)", () => {
    expect(classifyBalanceSweep({ ...base, balanceDueDate: "2026-06-25", reminderAlreadySent: true })).toBe("none");
  });

  it("overdue still cancels even if a reminder was already sent", () => {
    expect(classifyBalanceSweep({ ...base, balanceDueDate: "2026-06-20", reminderAlreadySent: true })).toBe("cancel");
  });
});
