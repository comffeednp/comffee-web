import { describe, expect, it } from "vitest";
import { checkoutSessionPaid } from "./paymongo";

// Guards the PS5-reservation settlement fix (2026-07-02): settleFloorplanRow flips a booking
// pending→confirmed on checkoutSessionPaid(...).paid — a false positive confirms an unpaid slot,
// a false negative expires a PAID customer at the 20-min mark. Pin every response shape.
describe("checkoutSessionPaid", () => {
  it("paid via payments[] as bare Payment resources", () => {
    const r = checkoutSessionPaid({
      data: { attributes: { status: "active", payments: [{ id: "pay_1", attributes: { status: "paid" } }] } },
    });
    expect(r).toEqual({ paid: true, paymentId: "pay_1" });
  });

  it("paid via payments[] wrapped in {data} (payment-link shape)", () => {
    const r = checkoutSessionPaid({
      data: { attributes: { payments: [{ data: { id: "pay_2", attributes: { status: "paid" } } }] } },
    });
    expect(r).toEqual({ paid: true, paymentId: "pay_2" });
  });

  it("paid via payment_intent status succeeded", () => {
    const r = checkoutSessionPaid({
      data: { attributes: { status: "active", payments: [], payment_intent: { id: "pi_1", attributes: { status: "succeeded" } } } },
    });
    expect(r.paid).toBe(true);
  });

  it("unpaid: active session, pending/failed payments only", () => {
    const r = checkoutSessionPaid({
      data: {
        attributes: {
          status: "active",
          payments: [{ id: "pay_3", attributes: { status: "failed" } }],
          payment_intent: { id: "pi_2", attributes: { status: "awaiting_payment_method" } },
        },
      },
    });
    expect(r.paid).toBe(false);
  });

  it("unpaid: empty and malformed payloads never throw or report paid", () => {
    expect(checkoutSessionPaid({}).paid).toBe(false);
    expect(checkoutSessionPaid({ data: {} }).paid).toBe(false);
    expect(checkoutSessionPaid({ data: { attributes: { payments: [{}] } } }).paid).toBe(false);
  });
});
