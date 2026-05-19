import { NextResponse } from "next/server";
import { markResolved } from "@/lib/chat";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { conversationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.conversationId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  await markResolved(body.conversationId);
  return NextResponse.json({ ok: true });
}
