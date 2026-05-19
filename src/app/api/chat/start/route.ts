import { NextResponse } from "next/server";
import { findOrCreateConversation, generateSessionToken } from "@/lib/chat";
import { guardMutating } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Customer-facing endpoint that returns (or creates) a chat session token
 * + the conversation row. The customer keeps the token in localStorage.
 */
export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "chat-start",
    limit: 10,
    windowMs: 5 * 60 * 1000,
    maxBytes: 4 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const body = (guarded.json as { sessionToken?: string; customerName?: string }) ?? {};
  const token =
    body.sessionToken &&
    typeof body.sessionToken === "string" &&
    body.sessionToken.length >= 16 &&
    body.sessionToken.length <= 64
      ? body.sessionToken
      : generateSessionToken();
  const customerName =
    typeof body.customerName === "string" && body.customerName.length <= 120
      ? body.customerName
      : undefined;

  try {
    const conversation = await findOrCreateConversation(token, customerName);
    return NextResponse.json({
      ok: true,
      sessionToken: token,
      conversationId: conversation.id,
      conversationStatus: conversation.status,
    });
  } catch (e) {
    console.error("chat start failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }
}
