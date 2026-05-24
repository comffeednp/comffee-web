import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { listUnseenConversations, markEscalationSent } from "@/lib/chat";
import { sendChatReminder } from "@/lib/email";

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
  const convs = await listUnseenConversations();
  const now = Date.now();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  let sent = 0;

  for (const c of convs) {
    const msgTime = new Date(c.last_message_at).getTime();
    const escAt = c.escalation_last_sent_at ? new Date(c.escalation_last_sent_at).getTime() : 0;
    // Has THIS unseen message already been escalated? (a newer message resets it)
    const alreadyEscalated = escAt >= msgTime;
    const due = alreadyEscalated
      ? now - escAt >= REPEAT_MS // then hourly
      : now - msgTime >= FIRST_MS; // first reminder at 5 min
    if (!due) continue;

    await sendChatReminder({
      customerName: c.customer_name,
      branchName: c.branch_name,
      lastMessage: c.last_message_body,
      waitingLabel: waitingLabel(now - msgTime),
      adminChatUrl: `${siteUrl}/admin/chat`,
    });
    await markEscalationSent(c.id);
    sent++;
  }

  return { ok: true, checked: convs.length, sent };
}

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });
  return NextResponse.json(await run());
}

export async function POST(request: Request) {
  return GET(request);
}
