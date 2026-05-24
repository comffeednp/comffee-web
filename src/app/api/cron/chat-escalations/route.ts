import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { listConversationsAwaitingCustomerReply, listUnseenConversations, markEscalationSent } from "@/lib/chat";
import { sendChatReminder, sendCustomerReplyReminder } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Emails the admin(s) about guest chats they haven't seen yet:
 *   - first reminder once the message has been waiting 5 minutes,
 *   - then once an hour after that,
 * until an admin opens the conversation (marks it seen) or replies.
 *
 * Run frequently (every ~5 min) via GitHub Actions. Auth: CRON_SECRET.
 */
const FIRST_MS = 5 * 60 * 1000;
const REPEAT_MS = 60 * 60 * 1000;

function waitingLabel(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const hrs = Math.round(min / 60);
  return `${hrs} hour${hrs === 1 ? "" : "s"}`;
}

async function run() {
  const now = Date.now();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";

  // Reminder due? first at 5 min, then hourly. A newer message resets the cycle
  // (escalation_last_sent_at < last_message_at means this message is un-escalated).
  const isDue = (lastAt: string, escAt: string | null) => {
    const msgTime = new Date(lastAt).getTime();
    const esc = escAt ? new Date(escAt).getTime() : 0;
    return esc >= msgTime ? now - esc >= REPEAT_MS : now - msgTime >= FIRST_MS;
  };

  // 1. ADMIN side — guest messages you haven't seen.
  const adminConvs = await listUnseenConversations();
  let adminSent = 0;
  for (const c of adminConvs) {
    if (!isDue(c.last_message_at, c.escalation_last_sent_at)) continue;
    await sendChatReminder({
      customerName: c.customer_name,
      branchName: c.branch_name,
      lastMessage: c.last_message_body,
      waitingLabel: waitingLabel(now - new Date(c.last_message_at).getTime()),
      adminChatUrl: `${siteUrl}/admin/chat`,
    });
    await markEscalationSent(c.id);
    adminSent++;
  }

  // 2. GUEST side — you replied and a member guest hasn't responded yet.
  const guestConvs = await listConversationsAwaitingCustomerReply();
  let guestSent = 0;
  for (const c of guestConvs) {
    if (!c.customer_email) continue;
    if (!isDue(c.last_message_at, c.escalation_last_sent_at)) continue;
    await sendCustomerReplyReminder({
      to: c.customer_email,
      guestName: c.customer_name,
      branchName: c.branch_name,
      lastMessage: c.last_message_body,
      chatUrl: siteUrl,
    });
    await markEscalationSent(c.id);
    guestSent++;
  }

  return { ok: true, adminChecked: adminConvs.length, adminSent, guestChecked: guestConvs.length, guestSent };
}

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });
  return NextResponse.json(await run());
}

export async function POST(request: Request) {
  return GET(request);
}
