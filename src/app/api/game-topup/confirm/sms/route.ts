import { NextResponse } from "next/server";
import { parseSmsConfirmation } from "@/lib/game-topups/confirm-parse";
import { applyConfirmation } from "@/lib/game-topups/fulfillment";
import { checkBearer } from "@/lib/game-topups/auth";

export const runtime = "nodejs";

// FALLBACK delivery confirmation: a Codashop "success" SMS relayed by MacroDroid (when the receipt
// email is delayed/missing). Bearer-gated with TOPUP_RELAY_TOKEN (fail-closed). Same matching as the
// email path — parses Riot ID + VP + reference, dedupes on reference.
//   POST { text: "<full sms>" }
export async function POST(request: Request) {
  if (!checkBearer(request, process.env.TOPUP_RELAY_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { text?: unknown; raw?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const raw = String(body.text ?? body.raw ?? body.message ?? "").trim();
  if (!raw) return NextResponse.json({ error: "no_body" }, { status: 400 });

  const parsed = parseSmsConfirmation(raw);
  const result = await applyConfirmation({ ...parsed, source: "sms", rawText: raw.slice(0, 1000) });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
