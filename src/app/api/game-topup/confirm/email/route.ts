import { NextResponse } from "next/server";
import { parseCodashopEmail } from "@/lib/game-topups/confirm-parse";
import { applyConfirmation } from "@/lib/game-topups/fulfillment";
import { checkBearer } from "@/lib/game-topups/auth";

export const runtime = "nodejs";

// PRIMARY delivery confirmation: a Codashop receipt email forwarded from the operator inbox to here
// (inbound-email provider / forwarder). Bearer-gated with TOPUP_INBOUND_TOKEN (fail-closed). Parses the
// Riot ID + VP + reference and ticks the matching order line; all lines ✅ → delivered + branded receipt.
//   POST { subject?, text?, html?, body? }  (any subset; all concatenated and parsed)
export async function POST(request: Request) {
  if (!checkBearer(request, process.env.TOPUP_INBOUND_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const raw = [body.subject, body.text, body.plain, body.body, body.html]
    .filter((v) => v != null)
    .map((v) => String(v))
    .join("\n")
    .trim();
  if (!raw) return NextResponse.json({ error: "no_body" }, { status: 400 });

  const parsed = parseCodashopEmail(raw);
  const result = await applyConfirmation({ ...parsed, source: "codashop_email", rawText: raw.slice(0, 4000) });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
