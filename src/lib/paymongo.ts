/**
 * Tiny PayMongo client. We talk to the REST API directly with `fetch` —
 * no SDK, no extra deps. Uses Payment Links (the simplest hosted-checkout
 * surface that supports GCash, Maya, GrabPay, and cards).
 *
 * Docs: https://developers.paymongo.com/reference/the-links-object
 */

import crypto from "node:crypto";

const API_BASE = "https://api.paymongo.com/v1";

/**
 * Build the Basic-auth header for a PayMongo call.
 *
 * `secretKey` is optional: when omitted we fall back to the platform env key
 * (process.env.PAYMONGO_SECRET_KEY). This keeps the EXISTING Playcation
 * booking / order / top-up flows working unchanged — they call without a key.
 * The per-branch cafe-reservation path passes the OWNER'S PayMongo secret key
 * (read server-side from branch_payment_config) so each cafe charges into its
 * own PayMongo account. The key is always server-only; it is never logged or
 * returned to the caller.
 */
function authHeader(secretKey?: string): string {
  const key = secretKey ?? process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    throw new Error("PAYMONGO_SECRET_KEY not configured");
  }
  // Basic auth: secret_key as username, no password
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export function isPaymongoConfigured(): boolean {
  return !!process.env.PAYMONGO_SECRET_KEY;
}

export interface CreatePaymentLinkInput {
  amountPhp: number;       // pesos (we convert to centavos internally)
  description: string;
  remarks?: string;
  redirectUrl?: string;    // where to send the customer after payment
  // Optional per-branch PayMongo secret key. Omit → uses the platform env key
  // (existing Playcation/order/top-up flows). The cafe-reservation path passes
  // the cafe owner's own key so the charge lands in their PayMongo account.
  secretKey?: string;
}

export interface PaymentLink {
  id: string;
  checkout_url: string;
  reference_number: string;
  status: string;
}

/** Create a hosted Payment Link. Customer pays at `checkout_url`. */
export async function createPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<PaymentLink> {
  const res = await fetch(`${API_BASE}/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(input.secretKey),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(input.amountPhp * 100),
          description: input.description,
          remarks: input.remarks ?? "",
          ...(input.redirectUrl && { redirect_url: input.redirectUrl }),
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayMongo create link failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    data: {
      id: string;
      attributes: {
        checkout_url: string;
        reference_number: string;
        status: string;
      };
    };
  };
  return {
    id: json.data.id,
    checkout_url: json.data.attributes.checkout_url,
    reference_number: json.data.attributes.reference_number,
    status: json.data.attributes.status,
  };
}

export interface CreateCheckoutInput {
  amountPhp: number; // pesos (converted to centavos internally)
  description: string;
  lineItemName: string; // shown on the hosted page (e.g. "PC reservation — PC-03")
  successUrl: string; // where PayMongo returns the customer after paying
  cancelUrl?: string;
  // Which methods the hosted page may show (see bookingPaymentMethods): QRPh always, + card only at
  // ₱100+ (PayMongo's card minimum; QRPh has no floor). Each method must be ACTIVATED on the PayMongo
  // account or the checkout shows "no payment methods available" — that's why we use QRPh (the one the
  // owner activated). (Basic Payment Links can't restrict methods — that's WHY bookings use a Checkout
  //  Session instead of createPaymentLink: the Session honors payment_method_types.)
  paymentMethodTypes: string[];
  remarks?: string;
  // Per-branch PayMongo secret key (the cafe owner's own). Omit → platform env key.
  secretKey?: string;
}

export interface CheckoutSession {
  id: string;
  checkout_url: string;
  status: string;
}

/**
 * Create a hosted Checkout Session. Like a Payment Link (customer pays at a
 * PayMongo-hosted `checkout_url`), but it accepts `payment_method_types` so we can
 * hide card on sub-₱100 bookings. Used by the online PC-reservation flow.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CheckoutSession> {
  const res = await fetch(`${API_BASE}/checkout_sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(input.secretKey),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          // PayMongo wants line items; one item carrying the whole amount is fine.
          line_items: [
            {
              name: input.lineItemName,
              amount: Math.round(input.amountPhp * 100),
              currency: "PHP",
              quantity: 1,
            },
          ],
          payment_method_types: input.paymentMethodTypes,
          description: input.description,
          ...(input.remarks && { remarks: input.remarks }),
          success_url: input.successUrl,
          ...(input.cancelUrl && { cancel_url: input.cancelUrl }),
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayMongo create checkout failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    data: { id: string; attributes: { checkout_url: string; status: string } };
  };
  return {
    id: json.data.id,
    checkout_url: json.data.attributes.checkout_url,
    status: json.data.attributes.status,
  };
}

/** The methods a booking pay-page should offer for a given amount.
 *
 * QRPh is the base (owner activated QRPh, NOT individual gcash/maya/grab_pay — 2026-06-01). It's the
 * one umbrella QR that GCash, Maya, GrabPay and banks all scan, so it covers every e-wallet with the
 * single method the account actually has live, at the cheapest rate. (The earlier gcash/maya/grab_pay
 * list produced "no payment methods available" on checkout because none of those were activated.)
 *
 * Card is added only for ₱100+ (PayMongo's card minimum; QRPh has no such floor). Card stays DORMANT
 * until the owner also activates Card in PayMongo — until then the checkout simply shows QRPh. So small
 * bookings are naturally fine (QRPh only), and card is ready the day it's switched on. */
export function bookingPaymentMethods(amountPhp: number): string[] {
  return amountPhp >= 100 ? ["qrph", "card"] : ["qrph"];
}

/** Retrieve a Payment Link to confirm its status (used as a fallback) */
export async function getPaymentLink(id: string) {
  const res = await fetch(`${API_BASE}/links/${id}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`PayMongo get link failed: ${res.status}`);
  return res.json();
}

export interface RefundInput {
  paymentId: string;
  amountPhp: number;
  reason: "duplicate" | "fraudulent" | "requested_by_customer" | "others";
  notes?: string;
}

export interface CreatedRefund {
  id: string;
  status: string;
}

/** Issue a refund against a paid payment. */
export async function createRefund(input: RefundInput): Promise<CreatedRefund> {
  const res = await fetch(`${API_BASE}/refunds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(input.amountPhp * 100),
          payment_id: input.paymentId,
          reason: input.reason,
          notes: input.notes ?? null,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayMongo refund failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    data: { id: string; attributes: { status: string } };
  };
  return { id: json.data.id, status: json.data.attributes.status };
}

/**
 * Verify a webhook signature using HMAC-SHA256.
 *
 * PayMongo sends a `Paymongo-Signature` header in the form:
 *   t=<timestamp>,te=<test_signature>,li=<live_signature>
 *
 * The signed payload is `<timestamp>.<raw_body>`.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const timestamp = parts.t;
  if (!timestamp) return false;
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  // Try both te (test) and li (live) — whichever matches
  for (const provided of [parts.te, parts.li]) {
    if (!provided || expected.length !== provided.length) continue;
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) return true;
  }
  return false;
}
