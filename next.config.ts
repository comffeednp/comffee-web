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
 *
 * NOTE: a strict CSP would require nonces per request and is intentionally
 * skipped here — see SECURITY.md for the rationale and what to add later.
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
];

// Permissions-Policy is route-specific. Default = lock everything down for the public site.
// The staff attendance page is the ONE exception: it needs the phone camera (face check) and
// geolocation (geofence). An empty allowlist "geolocation=()" makes the browser refuse silently
// WITHOUT prompting (returns PERMISSION_DENIED) — which is exactly why location was dead on the
// attendance page. So we scope camera+geolocation=(self) to that path only; everything else stays
// fully disabled. Both policies are sent as a single header per route (never two conflicting ones,
// or the browser would intersect to the stricter value and re-break location).
const PERMISSIONS_STRICT =
  "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self), usb=()";
const PERMISSIONS_ATTENDANCE =
  "camera=(self), microphone=(), geolocation=(self), interest-cohort=(), payment=(self), usb=()";

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
      // Everything EXCEPT the attendance page: fully locked down (negative lookahead).
      {
        source: "/((?!partners/[^/]+/attendance).*)",
        headers: [{ key: "Permissions-Policy", value: PERMISSIONS_STRICT }],
      },
    ];
  },
};

export default nextConfig;
