import type { MetadataRoute } from "next";
import { getAllBranchSlugs } from "@/lib/branches";

const STATIC_PATHS = ["", "/branches", "/playcation", "/menu", "/about", "/contact"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const slugs = await getAllBranchSlugs();
  const now = new Date();

  return [
    ...STATIC_PATHS.map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.8,
    })),
    ...slugs.map((slug) => ({
      url: `${base}/branches/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
