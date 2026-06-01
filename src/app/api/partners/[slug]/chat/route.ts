import { NextResponse } from "next/server";
import { z } from "zod";
import { listConversations, listMessages, markConversationSeen, postAdminMessage } from "@/lib/chat";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Staff-facing chat for the clock-in page (2026-06-01). A customer messaging from the booking page
// creates a branch-tagged conversation (lib/chat); the owner sees it in /admin/chat AND the on-duty
// staffer sees it HERE, on their clock-in page. This mirrors the admin chat route but authorizes as an
// APPROVED, currently-clocked-in staffer of THIS branch, and scopes every read/write to that branch's
// conversations only — a staffer can never see or reply to another branch's chats.
//
// Replies post as sender_type='admin' (postAdminMessage) so they look identical to the customer and to
// the owner's admin screen — the cafe speaks with one voice; the customer needn't know it's the cashier
// vs the owner. We pass the staff_id as the author id for the audit trail.

async function requireOnDutyStaff(slug: string) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = getSupabaseAdmin();
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!branch) return null;

  const email = user.email.toLowerCase();
  const { data: staff } = await admin
    .from("branch_staff")
    .select("id, status")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();
  if (!staff || staff.status !== "approved") return null;

  // Must be currently clocked IN — an off-shift worker shouldn't be answering customers.
  const { data: lastClock } = await admin
    .from("attendance_records")
    .select("clock_type")
    .eq("staff_id", staff.id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastClock?.clock_type !== "clock_in") return null;

  return { staffId: staff.id as string, branchId: branch.id as string };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const who = await requireOnDutyStaff(slug);
  if (!who) return NextResponse.json({ error: "not_on_shift" }, { status: 403 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  // No id → the branch's conversation list (scoped to this branch only).
  if (!conversationId) {
    const conversations = await listConversations(who.branchId);
    return NextResponse.json({ ok: true, conversations });
  }

  // Opening a conversation marks it seen + verify it really belongs to this branch before showing it.
  const admin = getSupabaseAdmin();
  const { data: conv } = await admin
    .from("chat_conversations")
    .select("id, branch_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.branch_id !== who.branchId) {
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const who = await requireOnDutyStaff(slug);
  if (!who) return NextResponse.json({ error: "not_on_shift" }, { status: 403 });

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

  // Confirm the conversation is this branch's before replying — a crafted id must not let a staffer
  // post into another branch's thread.
  const admin = getSupabaseAdmin();
  const { data: conv } = await admin
    .from("chat_conversations")
    .select("id, branch_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conv || conv.branch_id !== who.branchId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const message = await postAdminMessage(parsed.data.conversationId, who.staffId, parsed.data.body);
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    return NextResponse.json(
      { error: "send_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
