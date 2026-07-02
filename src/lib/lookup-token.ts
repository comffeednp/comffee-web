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

/**
 * Deterministic chat session token for a reservation's booking thread.
 *
 * The payment webhook (server) and the guest's browser (confirmed page) must
 * land on the SAME chat conversation without a shared DB column linking
 * reservation → conversation. Deriving the conversation's session token from
 * the reservation id gives both sides the key: whoever runs first creates the
 * thread, the other finds it (findOrCreateConversation is keyed on this token).
 *
 * Falls back to the Supabase service key as HMAC secret so the token always
 * exists where the confirm flow can run at all (getSupabaseAdmin needs that
 * key). Rotating the secret only means older bookings' threads stop being
 * auto-adopted by a returning guest — never a hard failure.
 * 43 chars (base64url SHA-256) — within /api/chat/start's 16–64 length gate.
 */
export function signChatSessionToken(reservationId: string): string {
  const s = secret() || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
  if (!s) return "";
  return crypto.createHmac("sha256", s).update(`chat:${reservationId}`).digest("base64url");
}
