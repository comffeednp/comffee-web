import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkBearer } from "@/lib/game-topups/auth";

export const runtime = "nodejs";

// MacroDroid → site OTP relay. Reads the Codashop OTP SMS on our phone and POSTs it here; the staff
// console shows the latest one next to the active order with a Copy button. Rows auto-expire (~5 min)
// and are purged on each post. Bearer-gated with TOPUP_RELAY_TOKEN (fail-closed).
//   POST { otp?: "123456", raw?: "<full sms>", sim?: "<label>" }
export async function POST(request: Request) {
  if (!checkBearer(request, process.env.TOPUP_RELAY_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { otp?: unknown; code?: unknown; raw?: unknown; sim?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const raw = body.raw != null ? String(body.raw).slice(0, 500) : null;
  let otp = String(body.otp ?? body.code ?? "").trim();
  // If no clean OTP was sent, pull the first 4-8 digit run out of the raw SMS body.
  if (!/^\d{3,10}$/.test(otp) && raw) {
    const m = raw.match(/\b(\d{4,8})\b/);
    otp = m ? m[1] : "";
  }
  if (!/^\d{3,10}$/.test(otp)) return NextResponse.json({ error: "no_otp" }, { status: 400 });
  const sim = body.sim != null ? String(body.sim).slice(0, 40) : null;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("game_topup_otp_relay").insert({ otp, sim, raw });
  if (error) {
    console.error("[game-topup] otp insert failed", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  // Housekeeping: drop expired OTPs so the console only ever sees fresh ones.
  await admin.from("game_topup_otp_relay").delete().lt("expires_at", new Date().toISOString());
  return NextResponse.json({ ok: true });
}
