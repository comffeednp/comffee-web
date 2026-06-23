import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercise the webhook's entity-routing fork: a payment matching a reservation's
// initial intent must confirm+notify the booking; one matching a *balance* intent
// must settle the balance; a failed payment cancels the hold; no match is ignored.
const h = vi.hoisted(() => {
  const makeBuilder = (result?: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "lt", "gt", "is", "order", "limit", "update"]) {
      b[m] = () => b;
    }
    b.insert = () => Promise.resolve({ error: null });
    b.maybeSingle = () => Promise.resolve(result ?? { data: null, error: null });
    b.then = (res: (v: unknown) => void) => res(result ?? { data: null, error: null });
    return b;
  };
  const tableResults: Record<string, unknown> = {
    branches: { data: { slug: "test-branch", name: "Test Branch" } },
  };
  return {
    confirmAndNotifyReservation: vi.fn(async () => {}),
    markBalancePaid: vi.fn(async () => {}),
    cancelReservation: vi.fn(async () => {}),
    getReservationByIntent: vi.fn(async () => null as unknown),
    getReservationByBalanceIntent: vi.fn(async () => null as unknown),
    from: vi.fn((table: string) => makeBuilder(tableResults[table])),
  };
});

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: h.from }) }));
vi.mock("@/lib/reservations", () => ({
  getReservationByIntent: h.getReservationByIntent,
  getReservationByBalanceIntent: h.getReservationByBalanceIntent,
  markBalancePaid: h.markBalancePaid,
  cancelReservation: h.cancelReservation,
}));
vi.mock("@/lib/booking-confirm", () => ({ confirmAndNotifyReservation: h.confirmAndNotifyReservation }));
vi.mock("@/lib/orders", () => ({
  getOrderById: vi.fn(async () => null),
  getOrderByIntent: vi.fn(async () => null),
  markOrderFailed: vi.fn(async () => {}),
  markOrderPaid: vi.fn(async () => {}),
}));
vi.mock("@/lib/paymongo", () => ({ verifyWebhookSignature: () => true }));
vi.mock("@/lib/email", () => ({
  sendBalancePaidReceipt: vi.fn(async () => {}),
  sendOrderConfirmation: vi.fn(async () => {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { POST } from "@/app/api/webhooks/paymongo/route";

function paidEvent(type = "link.payment.paid") {
  const payload = {
    data: {
      id: "evt_test",
      attributes: {
        type,
        data: { id: "link_1", attributes: { payments: [{ data: { id: "pay_1" } }] } },
      },
    },
  };
  return new Request("http://test/api/webhooks/paymongo", {
    method: "POST",
    headers: { "paymongo-signature": "t=1,te=sig" },
    body: JSON.stringify(payload),
  });
}

describe("PayMongo webhook — entity routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getReservationByIntent.mockResolvedValue(null);
    h.getReservationByBalanceIntent.mockResolvedValue(null);
  });

  it("initial reservation payment → confirm + notify (not a balance settle)", async () => {
    const reservation = { id: "res_1", branch_id: "br_1", guest_email: null };
    h.getReservationByIntent.mockResolvedValue(reservation);
    const res = await POST(paidEvent());
    const json = await res.json();
    expect(json.kind).toBe("reservation");
    expect(h.confirmAndNotifyReservation).toHaveBeenCalledWith(reservation, "pay_1");
    expect(h.markBalancePaid).not.toHaveBeenCalled();
  });

  it("balance payment → settles the balance (not a re-confirm)", async () => {
    h.getReservationByBalanceIntent.mockResolvedValue({
      id: "res_2", branch_id: "br_1", guest_email: null,
      check_in: "2026-07-01", check_out: "2026-07-03", balance_php: 2450, guest_name: "Guest",
    });
    const res = await POST(paidEvent());
    const json = await res.json();
    expect(json.kind).toBe("reservation_balance");
    expect(h.markBalancePaid).toHaveBeenCalledWith("res_2", "pay_1");
    expect(h.confirmAndNotifyReservation).not.toHaveBeenCalled();
  });

  it("no matching entity → ignored, nothing mutated", async () => {
    const res = await POST(paidEvent());
    const json = await res.json();
    expect(json.ignored).toBe("no_match_for_link");
    expect(h.confirmAndNotifyReservation).not.toHaveBeenCalled();
    expect(h.markBalancePaid).not.toHaveBeenCalled();
  });

  it("failed payment on a reservation → cancels the hold", async () => {
    h.getReservationByIntent.mockResolvedValue({ id: "res_3", branch_id: "br_1" });
    const res = await POST(paidEvent("payment.failed"));
    const json = await res.json();
    expect(json.kind).toBe("reservation");
    expect(h.cancelReservation).toHaveBeenCalled();
    expect(h.confirmAndNotifyReservation).not.toHaveBeenCalled();
  });
});
