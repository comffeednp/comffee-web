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
  created_at: string;
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

  if (existing) return existing as ChatConversation;

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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  sendNewChatInquiry({
    customerName,
    branchName,
    checkIn,
    checkOut,
    adminChatUrl: `${siteUrl}/admin/chat`,
  }).catch(() => {});

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
    .update({ last_message_at: new Date().toISOString(), status: "open" })
    .eq("id", conversation.id);

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
    .update({ last_message_at: new Date().toISOString(), assigned_admin_id: adminId })
    .eq("id", conversationId);

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

export async function listConversations(): Promise<(ChatConversation & { branch_name?: string | null })[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("chat_conversations")
    .select("*, branches(name)")
    .order("last_message_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((row) => {
    const { branches, ...rest } = row as typeof row & { branches?: { name: string } | null };
    return { ...rest, branch_name: branches?.name ?? null };
  }) as (ChatConversation & { branch_name?: string | null })[];
}

export async function markResolved(conversationId: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("chat_conversations")
    .update({ status: "resolved" })
    .eq("id", conversationId);
}

/** Generate a stable session token for a new customer chat. */
export function generateSessionToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}
