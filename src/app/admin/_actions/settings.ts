"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

const KNOWN_KEYS = [
  "company_name",
  "tagline",
  "contact_phone",
  "contact_email",
  "address",
  "hero_copy",
  "footer_blurb",
  "social_facebook",
  "social_instagram",
  "social_tiktok",
  "site_url",
];

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();

  const rows = KNOWN_KEYS.map((key) => ({
    key,
    value: String(formData.get(key) ?? ""),
  }));

  const { error } = await supabase
    .from("site_settings")
    .upsert(rows.map((r) => ({ key: r.key, value: r.value })), { onConflict: "key" });

  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  redirect("/admin/settings?ok=1");
}
