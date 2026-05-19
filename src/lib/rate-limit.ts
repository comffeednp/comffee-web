/**
 * Tiny in-memory rate limiter using fixed-window buckets.
 *
 * Limitations to know:
 *  - Per-instance only. On Vercel serverless, each function instance has its
 *    own bucket map, so the effective limit is `limit × instances`. For low
 *    traffic this is still useful; for production at scale swap this for
 *    Upstash Redis or Vercel KV.
 *  - State is lost on cold start. That's fine — abusers don't get a free
 *    pass because the bucket also resets.
 *  - Cleanup runs every 5 minutes to keep the map from leaking memory.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup of expired buckets
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  }, 5 * 60 * 1000);
  // Don't keep the process alive just for cleanup
  if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    const next: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return {
      ok: true,
      remaining: limit - 1,
      resetAt: next.resetAt,
      retryAfterSeconds: 0,
    };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count++;
  return {
    ok: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
    retryAfterSeconds: 0,
  };
}
