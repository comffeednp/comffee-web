import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: admin } = await supabase
    .from("admin_users").select("id").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "Comffee Drink and Play <onboarding@resend.dev>";
  const to = new URL(request.url).searchParams.get("to") ?? user.email ?? "";

  if (!key) return NextResponse.json({ error: "RESEND_API_KEY not set" });
  if (!to) return NextResponse.json({ error: "no recipient — add ?to=email@example.com" });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to,
      subject: "Comffee email test",
      html: "<p>If you see this, Resend is configured correctly.</p>",
      text: "If you see this, Resend is configured correctly.",
    }),
  });

  const body = await res.json();
  return NextResponse.json({
    status: res.status,
    ok: res.ok,
    from,
    to,
    resend_response: body,
    key_prefix: key.slice(0, 8) + "…",
  });
}
