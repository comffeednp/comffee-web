"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

async function getActionClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() ?? h.get("cf-connecting-ip")?.trim() ?? "unknown";
}

export async function memberSignupAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!email || !password || !fullName) {
    redirect("/account/signup?error=missing_fields");
  }
  if (password.length < 8) {
    redirect("/account/signup?error=password_too_short");
  }
  if (email.length > 254 || fullName.length > 120 || phone.length > 40) {
    redirect("/account/signup?error=invalid_input");
  }

  // Rate limit signup by IP — 5 per hour
  const ip = await getActionClientIp();
  const rl = checkRateLimit(`member-signup:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    redirect("/account/signup?error=rate_limited");
  }

  const supabase = await getSupabaseServer();

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpErr) {
    // Generic error — never tell the attacker whether the email is registered
    console.error("signup failed", signUpErr.message);
    redirect("/account/signup?error=signup_failed");
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    redirect("/account/signup?error=signup_failed");
  }

  // Create the members row using the service-role client (bypasses RLS)
  const admin = getSupabaseAdmin();
  const memberNumber = `M${Date.now().toString(36).toUpperCase()}`;
  const { error: insertErr } = await admin.from("members").insert({
    auth_user_id: userId,
    full_name: fullName,
    email,
    phone: phone || null,
    member_number: memberNumber,
    status: "active",
  });

  if (insertErr) {
    console.error("member row create failed", insertErr.message);
    redirect("/account/signup?error=signup_failed");
  }

  // If Supabase email confirmation is enabled, no session is returned —
  // tell the user to check their email. Otherwise log them straight in.
  if (!signUpData.session) {
    redirect("/account/login?ok=check_email");
  }

  revalidatePath("/", "layout");
  redirect("/account");
}

export async function memberLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/account");

  // Whitelist next param to prevent open redirect
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  if (!email || !password) {
    redirect(
      `/account/login?error=invalid_credentials&next=${encodeURIComponent(safeNext)}`,
    );
  }

  // Rate limit by IP — 10 per 15 min
  const ip = await getActionClientIp();
  const rl = checkRateLimit(`member-login:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    redirect(
      `/account/login?error=rate_limited&next=${encodeURIComponent(safeNext)}`,
    );
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Generic error — don't tell attackers whether the email is registered
    redirect(
      `/account/login?error=invalid_credentials&next=${encodeURIComponent(safeNext)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(safeNext);
}

export async function memberSignOutAction() {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function googleSignInAction(formData: FormData) {
  const next = String(formData.get("next") ?? "/account");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (h.get("x-forwarded-host")
      ? `https://${h.get("x-forwarded-host")}`
      : "http://localhost:3000");

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  });

  if (error || !data.url) redirect("/account/login?error=oauth_failed");
  redirect(data.url);
}
