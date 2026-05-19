import { NextResponse } from "next/server";
import { z } from "zod";
import { listMessages, postCustomerMessage } from "@/lib/chat";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyAdminsOfChat } from "@/lib/fcm";
import { guardMutating, rateLimit } from "@/lib/security";

export const runtime = "nodejs";

const sendSchema = z.object({
  sessionToken: z.string().min(16).max(64),
  body: z.string().min(1).max(2000),
  customerName: z.string().max(120).optional(),
});

/** GET — list messages for a conversation (by session token). Rate-limited. */
export async function GET(request: Request) {
  const limited = rateLimit(request, "chat-messages-get", 60, 5 * 60 * 1000);
  if (limited) return limited;

  const url = new URL(request.url);
  const token = url.searchParams.get("sessionToken");
  if (!token || token.length < 16 || token.length > 64) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: conv } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("customer_session_token", token)
    .maybeSingle();
  if (!conv) return NextResponse.json({ ok: true, messages: [] });
  const messages = await listMessages(conv.id);
  return NextResponse.json({ ok: true, conversationId: conv.id, messages });
}

/** POST — customer sends a message. Tightly rate-limited. */
export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "chat-messages-post",
    limit: 30,
    windowMs: 5 * 60 * 1000,
    maxBytes: 8 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = sendSchema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  try {
    const { conversation, message } = await postCustomerMessage(
      parsed.data.sessionToken,
      parsed.data.body,
      parsed.data.customerName,
    );
    notifyAdminsOfChat(conversation, message).catch((e) =>
      console.error("admin push failed", e instanceof Error ? e.message : e),
    );
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    console.error("chat send failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
