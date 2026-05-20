import { NextResponse } from "next/server";
import { checkRateLimit } from "./rate-limit";

/**
 * Resolve the client IP from headers Vercel / common reverse proxies set.
 * Falls back to "unknown" so rate limit keys are still valid (they'll all
 * collide but at least won't crash).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  const cfConnecting = req.headers.get("cf-connecting-ip");
  if (cfConnecting) return cfConnecting.trim();
  return "unknown";
}

/**
 * Verify the request originates from our own site. Blocks naive CSRF / cross-
 * origin POST attacks. Same-origin browser requests may omit Origin (e.g. fetch
 * from same host) — we accept that case as long as Referer agrees.
 *
 * Returns true if allowed, false if blocked.
 */
export function originAllowed(req: Request): boolean {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return true; // dev — no URL configured, be permissive

  let primaryHost: string;
  try {
    primaryHost = new URL(siteUrl).host;
  } catch {
    return true;
  }

  // Allow both www and non-www variants of the configured domain
  const allowed = new Set([primaryHost]);
  if (primaryHost.startsWith("www.")) {
    allowed.add(primaryHost.slice(4));
  } else {
    allowed.add(`www.${primaryHost}`);
  }
  // Also allow Vercel preview deployment URLs (auto-set by Vercel, no protocol)
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) allowed.add(vercelUrl);

  const check = (urlStr: string) => {
    try {
      return allowed.has(new URL(urlStr).host);
    } catch {
      return false;
    }
  };

  const origin = req.headers.get("origin");
  if (origin) return check(origin);

  const referer = req.headers.get("referer");
  if (referer) return check(referer);

  return false;
}

/**
 * Apply rate limiting based on the client IP. Returns a 429 response if the
 * limit was exceeded, or null if the request should proceed.
 */
export function rateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const ip = getClientIp(req);
  const result = checkRateLimit(`${bucket}:${ip}`, limit, windowMs);
  if (result.ok) return null;
  return NextResponse.json(
    {
      error: "rate_limited",
      retry_after_seconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}

/**
 * Read the request body as text, enforcing a maximum size. Returns the body
 * string on success, or a 413 NextResponse on overflow.
 */
export async function readBodyWithLimit(
  req: Request,
  maxBytes = 100 * 1024,
): Promise<{ body: string } | { error: NextResponse }> {
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > maxBytes) {
    return { error: NextResponse.json({ error: "body_too_large" }, { status: 413 }) };
  }
  try {
    const body = await req.text();
    if (body.length > maxBytes) {
      return { error: NextResponse.json({ error: "body_too_large" }, { status: 413 }) };
    }
    return { body };
  } catch {
    return { error: NextResponse.json({ error: "invalid_body" }, { status: 400 }) };
  }
}

/**
 * Composite guard: rate limit + origin check + body size + JSON parse.
 * Use this on every public mutating route.
 */
export async function guardMutating(
  req: Request,
  opts: {
    bucket: string;
    limit: number;
    windowMs: number;
    maxBytes?: number;
  },
): Promise<{ json: unknown } | { error: NextResponse }> {
  if (!originAllowed(req)) {
    return { error: NextResponse.json({ error: "bad_origin" }, { status: 403 }) };
  }
  const limited = rateLimit(req, opts.bucket, opts.limit, opts.windowMs);
  if (limited) return { error: limited };

  const bodyResult = await readBodyWithLimit(req, opts.maxBytes);
  if ("error" in bodyResult) return { error: bodyResult.error };

  try {
    const json = JSON.parse(bodyResult.body);
    return { json };
  } catch {
    return { error: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }
}
