import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
    }
  } catch {}
  return "*.supabase.co";
})();

/**
 * Security headers applied to every response.
 *
 * - HSTS forces HTTPS for 2 years (only takes effect over HTTPS — local dev is fine)
 * - X-Frame-Options DENY: prevents the site from being iframed (clickjacking)
 * - X-Content-Type-Options nosniff: blocks MIME-type confusion attacks
 * - Referrer-Policy strict-origin-when-cross-origin: leak no path info to other sites
 * - Permissions-Policy: disables camera/microphone/geolocation/FLoC by default
 * - X-DNS-Prefetch-Control on: small perf win
 * - Content-Security-Policy: only the three directives that are safe to ENFORCE
 *   without per-request nonces — they block plugin/object injection, <base>-tag
 *   hijacking, and clickjacking, and break nothing on a normal SPA. A full
 *   script-src/connect-src CSP needs nonce middleware (see SECURITY.md) and is
 *   the planned follow-up — do NOT add default-src/script-src here without it or
 *   Google Maps, Supabase, fonts, and Next's inline bootstrap will all break.
 */
// Everything EXCEPT Permissions-Policy (that one varies per route — see below).
const baseSecurityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  },
];

// Permissions-Policy is route-specific. Default = lock everything down for the public site.
// The staff attendance page is the ONE exception: it needs the phone camera (face check) and
// geolocation (geofence). An empty allowlist "geolocation=()" makes the browser refuse silently
// WITHOUT prompting (returns PERMISSION_DENIED) — which is exactly why location was dead on the
// attendance page. So we scope camera+geolocation=(self) to that path only; everything else stays
// fully disabled. Each route resolves to exactly ONE Permissions-Policy. Next.js does NOT send two
// headers for the browser to reconcile — when multiple rules set the SAME header key, the LAST
// matching rule's value OVERRIDES the earlier ones (see headers() below for the invariant this
// creates).
const PERMISSIONS_STRICT =
  "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self), usb=()";
const PERMISSIONS_ATTENDANCE =
  "camera=(self), microphone=(), geolocation=(self), interest-cohort=(), payment=(self), usb=()";
// The public Partner Cafes listing needs ONLY geolocation — for the "Near me" search. No camera.
// Without this it inherits geolocation=() and the browser silently denies getCurrentPosition (the
// same trap the attendance page hit — see the note above PERMISSIONS_STRICT).
const PERMISSIONS_PARTNERS =
  "camera=(), microphone=(), geolocation=(self), interest-cohort=(), payment=(self), usb=()";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async headers() {
    return [
      // Base headers on every route.
      { source: "/(.*)", headers: baseSecurityHeaders },
      // Attendance page: camera + location allowed (face check + geofence).
      {
        source: "/partners/:slug/attendance",
        headers: [{ key: "Permissions-Policy", value: PERMISSIONS_ATTENDANCE }],
      },
      // Partner Cafes LISTING (exact /partners): geolocation only, for the "Near me" search.
      {
        source: "/partners",
        headers: [{ key: "Permissions-Policy", value: PERMISSIONS_PARTNERS }],
      },
      // Everything ELSE: fully locked down. INVARIANT: this catch-all MUST stay LAST. Next overrides
      // on duplicate header keys (last matching rule wins), so if this rule MATCHED /partners or the
      // attendance route it would override their geolocation=(self) back to strict and silently
      // re-break location. The two negative lookaheads exist precisely to stop it from matching those
      // two routes. Keep it last AND keep the lookaheads — that is what protects the grants above.
      {
        source: "/((?!partners/[^/]+/attendance)(?!partners/?$).*)",
        headers: [{ key: "Permissions-Policy", value: PERMISSIONS_STRICT }],
      },
    ];
  },
};

export default nextConfig;
