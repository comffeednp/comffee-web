import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

export interface MemberProfile {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  member_number: string | null;
  status: "pending" | "active" | "suspended";
  joined_at: string;
  kyc_status: string | null;
  sumsub_applicant_id: string | null;
}

/**
 * Used by /account pages and member-only server actions. Redirects to login
 * if the caller isn't logged in or doesn't have a `members` row.
 */
export async function requireMember(returnTo?: string): Promise<MemberProfile> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/account/login${next}`);
  }

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!member) {
    redirect("/account/signup?error=no_member_profile");
  }
  return member as MemberProfile;
}

/** Soft check — returns the member if logged in, null otherwise. */
export async function getMemberOptional(): Promise<MemberProfile | null> {
  try {
    const supabase = await getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: member } = await supabase
      .from("members")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    return (member as MemberProfile) ?? null;
  } catch {
    // No env vars during build prerender, etc.
    return null;
  }
}
