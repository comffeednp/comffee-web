import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: [
      // /partners = the staff-only attendance clock-in. Keep it out of search results
      // (it's also unlinked + not in the sitemap, and gated by Google sign-in + POS approval).
      { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/partners"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
