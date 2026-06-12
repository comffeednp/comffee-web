import { NextResponse } from "next/server";
import { z } from "zod";
import { listConversations, listMessages, markConversationSeen, postAdminMessage } from "@/lib/chat";
import { canAccessConversationById, managerBranchIds } from "@/lib/chat-access";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Site-wide branch chat inbox for CHAT MANAGERS (2026-06-12). A partner cafe's
// admin lists owner/manager emails in Clockwork Settings -> "Website chat
// managers"; that list syncs up to branch_chat_managers (same channel as the
// branch payment config). When one of those emails signs into comffee.org with
// Google, /inbox shows their branch's website conversations anywhere on the
// site — not just the staff clock-in page (which keeps its own on-duty route at
// /api/partners/[slug]/chat).
//
// ENFORCEMENT (mirrors that staff route): every read and every reply re-checks
// that the conversation's branch_id is one of the CALLER's manager branches —
// a crafted conversation id from another cafe is refused with 403. Replies post
// as sender_type='admin' so the cafe speaks with one voice; the Google auth
// user id is kept as the author for the audit trail.

async function requireChatManager() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const admin = getSupabaseAdmin();
  const branchIds = await managerBranchIds(admin, user.email);
  if (!branchIds.length) return null;
  return { userId: user.id, email: user.email.toLowerCase(), branchIds };
}

export async function GET(request: Request) {
  const who = await requireChatManager();
  if (!who) return NextResponse.json({ error: "not_a_chat_manager" }, { status: 403 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    const conversations = await listConversations(who.branchIds);
    return NextResponse.json({ ok: true, conversations });
  }

  const admin = getSupabaseAdmin();
  if (!(await canAccessConversationById(admin, who.branchIds, conversationId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await markConversationSeen(conversationId);
  const messages = await listMessages(conversationId);
  return NextResponse.json({ ok: true, messages });
}

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const who = await requireChatManager();
  if (!who) return NextResponse.json({ error: "not_a_chat_manager" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!(await canAccessConversationById(admin, who.branchIds, parsed.data.conversationId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const message = await postAdminMessage(parsed.data.conversationId, who.userId, parsed.data.body);
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    return NextResponse.json(
      { error: "send_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
