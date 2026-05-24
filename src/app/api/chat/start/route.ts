import { NextResponse } from "next/server";
import { findOrCreateConversation, generateSessionToken } from "@/lib/chat";
import { getMemberOptional } from "@/lib/auth/require-member";
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

  const body = (guarded.json as { sessionToken?: string; customerName?: string; branchId?: string; branchName?: string; checkIn?: string; checkOut?: string; avatarUrl?: string }) ?? {};
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
  const branchId =
    typeof body.branchId === "string" && body.branchId.length <= 64 ? body.branchId : undefined;
  const branchName =
    typeof body.branchName === "string" && body.branchName.length <= 120 ? body.branchName : undefined;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const checkIn = typeof body.checkIn === "string" && isoDate.test(body.checkIn) ? body.checkIn : undefined;
  const checkOut = typeof body.checkOut === "string" && isoDate.test(body.checkOut) ? body.checkOut : undefined;
  const avatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl.startsWith("https://") && body.avatarUrl.length <= 512 ? body.avatarUrl : undefined;

  try {
    const member = await getMemberOptional();
    const conversation = await findOrCreateConversation(token, customerName, branchId, branchName, checkIn, checkOut, avatarUrl, member?.id, member?.email ?? undefined);
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
