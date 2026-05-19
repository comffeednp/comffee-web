import { createClient } from "@supabase/supabase-js";
import type {
  Branch,
  BranchAmenity,
  BranchPhoto,
  BranchRate,
  BranchFull,
  BranchType,
} from "@/lib/supabase/types";

// Cookie-free anon client — safe for SSG pages reading public data
function getSupabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, { auth: { persistSession: false } });
}

/**
 * Loads all published branches, optionally filtered by type. Used by the
 * home page, /branches index, and /playcation landing.
 */
export async function getPublishedBranches(type?: BranchType): Promise<Branch[]> {
  try {
    const supabase = getSupabaseAnon();
    let query = supabase
      .from("branches")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true });
    if (type) query = query.eq("type", type);
    const { data, error } = await query;
    if (error || !data) return [];
    return data as Branch[];
  } catch {
    return [];
  }
}

/** Loads a fully hydrated branch (amenities, photos, rates) by slug. */
export async function getBranchBySlug(slug: string): Promise<BranchFull | null> {
  try {
    const supabase = getSupabaseAnon();
    const { data: branch } = await supabase
      .from("branches")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (!branch) return null;

    const [amenitiesRes, photosRes, ratesRes] = await Promise.all([
      supabase
        .from("branch_amenities")
        .select("*")
        .eq("branch_id", branch.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("branch_photos")
        .select("*")
        .eq("branch_id", branch.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("branch_rates")
        .select("*")
        .eq("branch_id", branch.id)
        .order("sort_order", { ascending: true }),
    ]);

    return {
      ...(branch as Branch),
      amenities: (amenitiesRes.data ?? []) as BranchAmenity[],
      photos: (photosRes.data ?? []) as BranchPhoto[],
      rates: (ratesRes.data ?? []) as BranchRate[],
    };
  } catch {
    return null;
  }
}

/** All branch slugs — for `generateStaticParams` on the [slug] route. */
export async function getAllBranchSlugs(): Promise<string[]> {
  try {
    const supabase = getSupabaseAnon();
    const { data } = await supabase
      .from("branches")
      .select("slug")
      .eq("is_published", true);
    return (data ?? []).map((r) => r.slug as string);
  } catch {
    return [];
  }
}
