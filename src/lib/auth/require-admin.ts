import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/supabase/types";

/**
 * Used by admin pages and server actions. Redirects to /admin (login)
 * if the caller isn't logged in or isn't an active admin.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin");

  const { data: admin } = await supabase
    .from("admin_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!admin) redirect("/admin?error=not_admin");
  return admin as AdminUser;
}

/**
 * For mutating actions. Same as requireAdmin, but read-only "partner" admins are
 * rejected — they can view everything but can't edit or send messages.
 */
export async function requireEditor(): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (admin.role === "partner") redirect("/admin/dashboard?error=read_only");
  return admin;
}

/**
 * Blocks read-only partners entirely — for global/owner pages a branch-partner
 * should never see (branch settings, menu, promos, airbnb, settings, audit).
 */
export async function requireFullAdmin(): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (admin.role === "partner") redirect("/admin/dashboard?error=forbidden");
  return admin;
}

/**
 * The branch a viewer is limited to. `null` = all branches (owner/staff).
 * A partner is limited to their assigned branch; if somehow unassigned, the
 * sentinel "__none__" matches nothing (fail closed — see nothing, not everything).
 */
export async function getAdminScope(): Promise<{ admin: AdminUser; branchId: string | null }> {
  const admin = await requireAdmin();
  const branchId = admin.role === "partner" ? (admin.branch_id ?? "__none__") : null;
  return { admin, branchId };
}

/** Owner-only (super_admin) — e.g. managing partner accounts. */
export async function requireSuperAdmin(): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") redirect("/admin/dashboard?error=forbidden");
  return admin;
}

/** Soft check — returns the admin if logged in as an active admin, null otherwise. */
export async function getAdminOptional(): Promise<AdminUser | null> {
  try {
    const supabase = await getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("admin_users")
      .select("*")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    return (data as AdminUser) ?? null;
  } catch {
    return null;
  }
}
