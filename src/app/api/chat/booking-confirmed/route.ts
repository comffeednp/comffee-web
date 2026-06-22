import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatRange } from "@/lib/dates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { sessionToken?: string; reservationId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const { sessionToken, reservationId } = body;
  if (!sessionToken || typeof sessionToken !== "string") {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Find the conversation for this session token
  const { data: conversation } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("customer_session_token", sessionToken)
    .maybeSingle();

  if (!conversation) return NextResponse.json({ ok: true }); // no conversation yet — silently ok

  // Build the confirmation message + grab member_id for linking
  let confirmText = "✓ Booking confirmed!";
  let memberId: string | null = null;
  if (reservationId) {
    const { data: res } = await supabase
      .from("reservations")
      .select("check_in, check_out, member_id")
      .eq("id", reservationId)
      .maybeSingle();
    if (res) {
      confirmText += ` ${formatRange(res.check_in, res.check_out)}`;
      memberId = (res as { member_id?: string | null }).member_id ?? null;
    }
  }

  // Idempotency: the server-side confirm path (webhook / hold-sweep rescue /
  // admin) may already have posted this. Don't double up.
  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "system")
    .ilike("body", "%booking confirmed%")
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (memberId) {
      await supabase.from("chat_conversations").update({ member_id: memberId }).eq("id", conversation.id);
    }
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await supabase.from("chat_messages").insert({
    conversation_id: conversation.id,
    sender_type: "system",
    body: confirmText,
  });

  await supabase
    .from("chat_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_body: confirmText,
      last_message_sender_type: "system",
      ...(memberId ? { member_id: memberId } : {}),
    })
    .eq("id", conversation.id);

  return NextResponse.json({ ok: true });
}
