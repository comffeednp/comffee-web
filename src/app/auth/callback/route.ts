import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  if (!code) {
    return NextResponse.redirect(`${origin}/account/login?error=oauth_no_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/account/login?error=oauth_failed`);
  }

  // Create a members row on first Google sign-in
  const user = data.session.user;
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const memberNumber = `M${Date.now().toString(36).toUpperCase()}`;
    await admin.from("members").insert({
      auth_user_id: user.id,
      full_name:
        user.user_metadata.full_name ??
        user.user_metadata.name ??
        user.email?.split("@")[0] ??
        "Member",
      email: user.email ?? "",
      phone: null,
      member_number: memberNumber,
      status: "active",
    });
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
