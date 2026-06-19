import crypto from "node:crypto";

// Bearer-token gate for the relay / inbound-confirmation endpoints (MacroDroid OTP, Codashop receipt
// forwarder, SMS success relay). FAIL-CLOSED: a missing secret rejects — these endpoints fulfil orders,
// so they must be explicitly configured (unlike the public Turnstile seam, which fails open). Accepts
// `Authorization: Bearer <token>` or `?token=`; constant-time compare.
export function checkBearer(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    new URL(req.url).searchParams.get("token") ||
    "";
  if (!provided || provided.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}
