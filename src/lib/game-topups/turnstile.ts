// Cloudflare Turnstile bot-gate SEAM. The repo has no Turnstile dependency today; abuse control is
// guardMutating (origin + per-IP rate limit) + the OCR ladder + the daily Vision breaker. This verifier
// drops Turnstile in cleanly when the owner adds the keys: it FAILS OPEN when TURNSTILE_SECRET_KEY is
// unset (same "configured?" convention as Vision / Resend / PayMongo), and only enforces the token once
// the secret exists. No new dependency — raw fetch to the siteverify endpoint.
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → don't block
  if (!token) return false; // configured but no token → block
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return true; // infra error → fail open
    const json = (await res.json().catch(() => ({}))) as { success?: boolean };
    return json?.success === true;
  } catch {
    return true; // infra error → fail open
  }
}
