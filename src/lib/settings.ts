import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Loads `site_settings` keyed rows into a single shape. Falls back to
 * sensible defaults if Supabase isn't configured (e.g. during initial
 * local dev before the user has run migrations).
 */
export interface SiteSettings {
  company_name: string;
  tagline: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  hero_copy: string;
  footer_blurb: string;
  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  site_url: string;
}

const DEFAULTS: SiteSettings = {
  company_name: "Comffee Drink and Play",
  tagline:
    "Internet cafes and gaming staycations across the Philippines.",
  contact_phone: "+63 917 000 0000",
  contact_email: "hello@comffee.ph",
  address: "Quezon City, Metro Manila, Philippines",
  hero_copy: "Internet cafes and gaming staycations across the Philippines.",
  footer_blurb:
    "Comffee Drink and Play runs internet cafes and gaming staycations across the Philippines.",
  social_facebook: "",
  social_instagram: "",
  social_tiktok: "",
  site_url: "http://localhost:3000",
};

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error || !data) return DEFAULTS;
    const merged: Record<string, string> = { ...DEFAULTS };
    for (const row of data) {
      const v = row.value;
      merged[row.key] = typeof v === "string" ? v : String(v ?? "");
    }
    return { ...DEFAULTS, ...merged } as SiteSettings;
  } catch {
    return DEFAULTS;
  }
}
