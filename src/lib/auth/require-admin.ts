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
