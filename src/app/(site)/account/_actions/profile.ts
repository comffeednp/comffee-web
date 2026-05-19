"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth/require-member";
import { checkRateLimit } from "@/lib/rate-limit";

async function getActionClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return h.get("x-real-ip")?.trim() ?? "unknown";
}

export async function updateProfileAction(formData: FormData) {
  const member = await requireMember();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!fullName) redirect("/account/profile?error=name_required");
  if (fullName.length > 120 || phone.length > 40) {
    redirect("/account/profile?error=invalid_input");
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("members")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", member.id);

  if (error) {
    redirect(`/account/profile?error=${encodeURIComponent("save_failed")}`);
  }
  revalidatePath("/account/profile");
  revalidatePath("/account");
  revalidatePath("/", "layout");
  redirect("/account/profile?ok=saved");
}

export async function changePasswordAction(formData: FormData) {
  await requireMember();

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!current || !next || !confirm) {
    redirect("/account/profile?error=missing_fields");
  }
  if (next.length < 8) {
    redirect("/account/profile?error=password_too_short");
  }
  if (next !== confirm) {
    redirect("/account/profile?error=passwords_dont_match");
  }

  // Rate limit password changes — 5 per IP per hour
  const ip = await getActionClientIp();
  const rl = checkRateLimit(`password-change:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    redirect("/account/profile?error=rate_limited");
  }

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/account/profile?error=session_expired");

  // Verify the current password by attempting a sign-in (Supabase doesn't
  // expose a "verify password" call directly).
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (verifyErr) {
    redirect("/account/profile?error=current_password_wrong");
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password: next });
  if (updateErr) {
    redirect("/account/profile?error=update_failed");
  }
  redirect("/account/profile?ok=password_changed");
}

export async function deleteMemberAccountAction(formData: FormData) {
  const member = await requireMember();
  const confirmation = String(formData.get("confirm") ?? "");
  if (confirmation !== "DELETE") {
    redirect("/account/profile?error=type_DELETE_to_confirm");
  }

  const admin = getSupabaseAdmin();
  // Delete the members row first (cascades to internet_reservations via FK)
  await admin.from("members").delete().eq("id", member.id);
  // Then delete the auth user (Supabase admin API)
  if (member.auth_user_id) {
    await admin.auth.admin.deleteUser(member.auth_user_id);
  }

  // Sign out and redirect home
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?ok=account_deleted");
}
