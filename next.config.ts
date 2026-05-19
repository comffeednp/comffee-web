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
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

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
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
