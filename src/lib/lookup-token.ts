import crypto from "node:crypto";

/**
 * Signed, shareable booking links. The confirmation email links to
 * /b/<id>?t=<token> where token = HMAC(secret, id). This lets a guest open
 * their booking in one click without re-entering the email they booked with —
 * the signature proves they got the link from us, so it's safe to show the
 * booking without the /lookup contact challenge.
 *
 * Secret: LOOKUP_SIGNING_SECRET (set in Vercel). If unset, tokens never verify
 * (fail closed) — the guest can still use the manual /lookup form.
 */
function secret(): string | null {
  return process.env.LOOKUP_SIGNING_SECRET || null;
}

export function signLookupToken(id: string): string {
  const s = secret();
  if (!s) return "";
  return crypto.createHmac("sha256", s).update(`lookup:${id}`).digest("base64url");
}

export function verifyLookupToken(id: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = signLookupToken(id);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
