/**
 * Shared auth check for cron endpoints. Fails CLOSED in production:
 * if CRON_SECRET is not set, returns false — never default to open.
 * In development we allow unset secrets so local testing isn't blocked.
 */
export interface CronAuthResult {
  ok: boolean;
  status: number;
  reason?: string;
}

export function checkCronAuth(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 503,
        reason: "cron_secret_not_configured",
      };
    }
    return { ok: true, status: 200 };
  }
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret");
  if (!provided) {
    return { ok: false, status: 401, reason: "missing_secret" };
  }
  // Constant-time compare to defeat timing attacks
  if (provided.length !== secret.length) {
    return { ok: false, status: 401, reason: "invalid_secret" };
  }
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0
    ? { ok: true, status: 200 }
    : { ok: false, status: 401, reason: "invalid_secret" };
}
