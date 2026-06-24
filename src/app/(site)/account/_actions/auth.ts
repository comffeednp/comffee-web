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
  // Carry `next` through signup so a customer who creates an account mid-booking returns to booking
  // (e.g. from the reserve-pc gate). Whitelisted to internal paths to prevent open redirects.
  const next = String(formData.get("next") ?? "");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  const nextQ = safeNext !== "/account" ? `&next=${encodeURIComponent(safeNext)}` : "";

  if (!email || !password || !fullName) {
    redirect(`/account/signup?error=missing_fields${nextQ}`);
  }
  if (password.length < 8) {
    redirect(`/account/signup?error=password_too_short${nextQ}`);
  }
  if (email.length > 254 || fullName.length > 120 || phone.length > 40) {
    redirect(`/account/signup?error=invalid_input${nextQ}`);
  }

  // Rate limit signup by IP — 5 per hour
  const ip = await getActionClientIp();
  const rl = checkRateLimit(`member-signup:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    redirect(`/account/signup?error=rate_limited${nextQ}`);
  }

  const supabase = await getSupabaseServer();

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpErr) {
    // Generic error — never tell the attacker whether the email is registered
    console.error("signup failed", signUpErr.message);
    redirect(`/account/signup?error=signup_failed${nextQ}`);
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    redirect(`/account/signup?error=signup_failed${nextQ}`);
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
    redirect(`/account/signup?error=signup_failed${nextQ}`);
  }

  // If Supabase email confirmation is enabled, no session is returned —
  // tell the user to check their email. Otherwise log them straight in.
  if (!signUpData.session) {
    redirect(`/account/login?ok=check_email${nextQ}`);
  }

  revalidatePath("/", "layout");
  redirect(safeNext);
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
  // Optional: attendance passes prompt="select_account" so Google ALWAYS shows the account
  // chooser instead of silently reusing the one signed-in account (a shared/clock-in phone
  // must let each staffer pick THEIR account). Member login omits it → unchanged behaviour.
  const promptParam = String(formData.get("prompt") ?? "");

  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      ...(promptParam ? { queryParams: { prompt: promptParam } } : {}),
    },
  });

  if (error || !data.url) redirect("/account/login?error=oauth_failed");
  redirect(data.url);
}

// Sign out, then return to `next` — used by the attendance page's "use a different account"
// so a leftover session on a shared phone can be swapped without going to the member area.
export async function switchAccountAction(formData: FormData) {
  const next = String(formData.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(safeNext);
}
