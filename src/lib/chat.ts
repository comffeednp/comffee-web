import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendNewChatInquiry } from "@/lib/email";
import crypto from "node:crypto";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_type: "customer" | "admin" | "system";
  sender_id: string | null;
  body: string;
  attachment_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  customer_session_token: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_avatar_url: string | null;
  branch_id: string | null;
  inquiry_check_in: string | null;
  inquiry_check_out: string | null;
  status: string;
  assigned_admin_id: string | null;
  last_message_at: string;
  last_message_body: string | null;
  last_message_sender_type: string | null;
  admin_last_read_at: string | null;
  escalation_last_sent_at: string | null;
  created_at: string;
}

async function broadcastToConversation(conversationId: string, message: ChatMessage): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "apikey": key,
      },
      body: JSON.stringify({
        messages: [{ topic: `realtime:chat:${conversationId}`, event: "message", payload: { message } }],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // best effort
  }
}

/** Customer-facing — find or create a conversation by their session token. */
export async function findOrCreateConversation(
  sessionToken: string,
  customerName?: string,
  branchId?: string,
  branchName?: string,
  checkIn?: string,
  checkOut?: string,
  avatarUrl?: string,
): Promise<ChatConversation> {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("customer_session_token", sessionToken)
    .maybeSingle();

  if (existing) {
    const conv = existing as ChatConversation;
    // Returning visitor opening chat with a DIFFERENT branch/dates than the
    // thread currently holds = a new inquiry. Refresh the thread's context,
    // drop a divider note so both sides see the switch, and alert the admin.
    const isNewInquiry =
      !!branchId &&
      (branchId !== conv.branch_id ||
        (checkIn ?? null) !== conv.inquiry_check_in ||
        (checkOut ?? null) !== conv.inquiry_check_out);
    if (isNewInquiry) {
      await supabase
        .from("chat_conversations")
        .update({
          branch_id: branchId,
          inquiry_check_in: checkIn ?? null,
          inquiry_check_out: checkOut ?? null,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conv.id);
      conv.branch_id = branchId;
      conv.inquiry_check_in = checkIn ?? null;
      conv.inquiry_check_out = checkOut ?? null;

      const fmt = (s: string) =>
        new Date(s + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
      const summary = [branchName, checkIn && checkOut ? `${fmt(checkIn)} – ${fmt(checkOut)}` : null]
        .filter(Boolean)
        .join(" · ");
      if (summary) {
        const note = `New inquiry — ${summary}`;
        await supabase.from("chat_messages").insert({
          conversation_id: conv.id,
          sender_type: "system",
          body: note,
        });
        await supabase
          .from("chat_conversations")
          .update({ last_message_body: note, last_message_sender_type: "system" })
          .eq("id", conv.id);
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
        await sendNewChatInquiry({
          customerName: conv.customer_name ?? customerName,
          branchName,
          checkIn,
          checkOut,
          adminChatUrl: `${siteUrl}/admin/chat`,
        }).catch(() => {});
      }
    }
    return conv;
  }

  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({
      customer_session_token: sessionToken,
      customer_name: customerName ?? null,
      customer_avatar_url: avatarUrl ?? null,
      branch_id: branchId ?? null,
      inquiry_check_in: checkIn ?? null,
      inquiry_check_out: checkOut ?? null,
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(`conversation create failed: ${error?.message}`);

  // Post a system message so admin immediately sees context
  const contextParts: string[] = [];
  if (branchName) contextParts.push(`Inquiry about: ${branchName}`);
  if (checkIn && checkOut) {
    const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    contextParts.push(`Dates: ${fmt(checkIn)} – ${fmt(checkOut)}`);
  }
  if (contextParts.length > 0) {
    await supabase.from("chat_messages").insert({
      conversation_id: data.id,
      sender_type: "system",
      body: contextParts.join(" · "),
    });
  }

  return data as ChatConversation;
}

export async function postCustomerMessage(
  sessionToken: string,
  body: string,
  customerName?: string,
): Promise<{ conversation: ChatConversation; message: ChatMessage }> {
  const supabase = getSupabaseAdmin();
  const conversation = await findOrCreateConversation(sessionToken, customerName);

  // Update name if provided and not set yet
  if (customerName && !conversation.customer_name) {
    await supabase
      .from("chat_conversations")
      .update({ customer_name: customerName })
      .eq("id", conversation.id);
    conversation.customer_name = customerName;
  }

  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversation.id,
      sender_type: "customer",
      body,
    })
    .select("*")
    .single();
  if (error || !message) throw new Error(`message insert failed: ${error?.message}`);

  // Bump last_message_at
  await supabase
    .from("chat_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      status: "open",
      last_message_body: body,
      last_message_sender_type: "customer",
    })
    .eq("id", conversation.id);

  // Send admin email notification on the FIRST customer message only (not on empty session open)
  const { count } = await supabase
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "customer");
  if (count === 1) {
    // Fetch branch name for email context
    let branchName: string | undefined;
    if (conversation.branch_id) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", conversation.branch_id)
        .maybeSingle();
      branchName = branch?.name ?? undefined;
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
    // Awaited (not fire-and-forget): on serverless, un-awaited work after the
    // response can be killed before it finishes, dropping the alert.
    await sendNewChatInquiry({
      customerName: conversation.customer_name ?? customerName,
      branchName,
      checkIn: conversation.inquiry_check_in ?? undefined,
      checkOut: conversation.inquiry_check_out ?? undefined,
      adminChatUrl: `${siteUrl}/admin/chat`,
    }).catch(() => {});
  }

  broadcastToConversation(conversation.id, message as ChatMessage).catch(() => {});

  return {
    conversation,
    message: message as ChatMessage,
  };
}

export async function postAdminMessage(
  conversationId: string,
  adminId: string,
  body: string,
): Promise<ChatMessage> {
  const supabase = getSupabaseAdmin();
  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_type: "admin",
      sender_id: adminId,
      body,
    })
    .select("*")
    .single();
  if (error || !message) throw new Error(`admin reply failed: ${error?.message}`);

  await supabase
    .from("chat_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      assigned_admin_id: adminId,
      last_message_body: body,
      last_message_sender_type: "admin",
    })
    .eq("id", conversationId);

  broadcastToConversation(conversationId, message as ChatMessage).catch(() => {});

  return message as ChatMessage;
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ChatMessage[];
}

export async function listConversations(): Promise<(ChatConversation & { branch_name?: string | null; unread: boolean })[]> {
  const supabase = getSupabaseAdmin();
  const [{ data: rows }, { data: activeIds }] = await Promise.all([
    supabase
      .from("chat_conversations")
      .select("*, branches(name)")
      .order("last_message_at", { ascending: false })
      .limit(200),
    supabase
      .from("chat_messages")
      .select("conversation_id")
      .eq("sender_type", "customer")
      .limit(1000),
  ]);
  const hasCustomerMessage = new Set((activeIds ?? []).map((m: { conversation_id: string }) => m.conversation_id));
  return ((rows ?? []) as (typeof rows extends (infer T)[] | null ? T : never)[])
    .filter((row) => hasCustomerMessage.has((row as { id: string }).id))
    .map((row) => {
      const { branches, ...rest } = row as typeof row & { branches?: { name: string } | null };
      const conv = rest as unknown as ChatConversation;
      return {
        ...rest,
        branch_name: (branches as { name: string } | null)?.name ?? null,
        unread: isUnseen(conv),
      };
    }) as (ChatConversation & { branch_name?: string | null; unread: boolean })[];
}

/** Mark a conversation as seen by an admin — clears its unread/escalation state. */
export async function markConversationSeen(conversationId: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("chat_conversations")
    .update({ admin_last_read_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/** Latest message is an UNSEEN customer message — i.e. waiting on the admin. */
function isUnseen(c: ChatConversation): boolean {
  return (
    c.last_message_sender_type === "customer" &&
    (!c.admin_last_read_at ||
      new Date(c.last_message_at).getTime() > new Date(c.admin_last_read_at).getTime())
  );
}

/** Conversations awaiting an admin reply (for the escalation cron). */
export async function listUnseenConversations(): Promise<
  (ChatConversation & { branch_name?: string | null })[]
> {
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from("chat_conversations")
    .select("*, branches(name)")
    .eq("last_message_sender_type", "customer")
    .order("last_message_at", { ascending: true })
    .limit(500);
  const list = (rows ?? []) as (ChatConversation & { branches?: { name: string } | null })[];
  return list.filter(isUnseen).map((row) => {
    const { branches, ...rest } = row;
    return { ...rest, branch_name: branches?.name ?? null };
  });
}

/** Record that an "unanswered chat" reminder was just emailed. */
export async function markEscalationSent(conversationId: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("chat_conversations")
    .update({ escalation_last_sent_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/** Generate a stable session token for a new customer chat. */
export function generateSessionToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}
