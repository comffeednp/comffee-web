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

  // Track which cookies Supabase wants to set, then apply them to the response.
  const cookieStore = await cookies();
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) {
          for (const c of toSet) pendingCookies.push(c);
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const detail = encodeURIComponent(error?.message ?? "no_session");
    console.error("[auth/callback] exchangeCodeForSession failed:", error?.message);
    return NextResponse.redirect(`${origin}/account/login?error=oauth_failed&detail=${detail}`);
  }

  // Ensure members row exists for this Google user
  const user = data.session.user;
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const memberNumber = `M${Date.now().toString(36).toUpperCase()}`;
    const { error: insertErr } = await admin.from("members").insert({
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
    if (insertErr) {
      console.error("[auth/callback] members insert failed:", insertErr.message);
      return NextResponse.redirect(
        `${origin}/account/login?error=profile_create_failed&detail=${encodeURIComponent(insertErr.message)}`,
      );
    }
  }

  // Return a 200 HTML page that sets cookies and then redirects.
  // Some browsers drop Set-Cookie headers on 302 responses; a 200 is reliable.
  const redirectTo = `${origin}${safeNext}`;
  const html = `<!DOCTYPE html><html><head><title>Signing in…</title>
<meta http-equiv="refresh" content="0;url=${redirectTo}">
<script>window.location.replace(${JSON.stringify(redirectTo)})</script>
</head><body></body></html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  }

  return response;
}
