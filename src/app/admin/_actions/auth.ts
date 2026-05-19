"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Resolve client IP from request headers (Vercel / common proxies set XFF).
 * Server actions don't get a Request object directly — we read headers via the
 * next/headers helper.
 */
async function getActionClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() ?? h.get("cf-connecting-ip")?.trim() ?? "unknown";
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    redirect("/admin?error=invalid_credentials");
  }

  // Rate limit by IP — 5 attempts per 15 min. Failed attempts count.
  const ip = await getActionClientIp();
  const rl = checkRateLimit(`admin-signin:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.ok) {
    redirect(`/admin?error=rate_limited`);
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Generic error — never tell the attacker whether the email exists
    redirect(`/admin?error=invalid_credentials`);
  }

  // Verify the user is an active admin
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: admin } = await supabase
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!admin) {
      await supabase.auth.signOut();
      redirect("/admin?error=invalid_credentials");
    }
  }

  revalidatePath("/admin", "layout");
  redirect("/admin/dashboard");
}

export async function signOutAction() {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/admin", "layout");
  redirect("/admin");
}
