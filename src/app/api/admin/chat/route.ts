import { NextResponse } from "next/server";
import { z } from "zod";
import { listConversations, listMessages, postAdminMessage } from "@/lib/chat";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function requireAdminApi() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return (admin as { id: string } | null) ?? null;
}

export async function GET(request: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    const conversations = await listConversations();
    return NextResponse.json({ ok: true, conversations });
  }

  const messages = await listMessages(conversationId);
  return NextResponse.json({ ok: true, messages });
}

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  try {
    const message = await postAdminMessage(
      parsed.data.conversationId,
      admin.id,
      parsed.data.body,
    );
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    return NextResponse.json(
      { error: "send_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
