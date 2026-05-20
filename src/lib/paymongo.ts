/**
 * Tiny PayMongo client. We talk to the REST API directly with `fetch` —
 * no SDK, no extra deps. Uses Payment Links (the simplest hosted-checkout
 * surface that supports GCash, Maya, GrabPay, and cards).
 *
 * Docs: https://developers.paymongo.com/reference/the-links-object
 */

import crypto from "node:crypto";

const API_BASE = "https://api.paymongo.com/v1";

function authHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY;
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
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(input.amountPhp * 100),
          description: input.description,
          remarks: input.remarks ?? "",
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
