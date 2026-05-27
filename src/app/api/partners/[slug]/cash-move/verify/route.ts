import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Step 2 of a website cash move: the worker enters the 6-digit code the owner relayed. We check it
// server-side (the client never sees the code) and, on a match, flip the row to 'approved' — which is
// what the POS pulls. Only the staffer who created the move can approve it. See 0031_cash_moves.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const supa = await getSupabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  }

  // Limit guesses so the 6-digit code can't be brute-forced.
  const rl = checkRateLimit(`cash-move-verify:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { moveId?: string; code?: string };
  const moveId = String(body.moveId ?? "");
  const code = String(body.code ?? "").trim();
  if (!moveId || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const email = user.email.toLowerCase();

  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!branch) {
    return NextResponse.json({ ok: false, error: "branch_not_found" }, { status: 404 });
  }
  const { data: staff } = await admin
    .from("branch_staff")
    .select("id")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "no_staff_row" }, { status: 404 });
  }

  const { data: move } = await admin
    .from("cash_moves")
    .select("id, approval_code, status, staff_id, branch_id")
    .eq("id", moveId)
    .maybeSingle();
  // Must exist, belong to THIS staffer + branch, and still be awaiting its code.
  if (!move || move.staff_id !== staff.id || move.branch_id !== branch.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (move.status !== "pending_code") {
    return NextResponse.json({ ok: false, error: "already_used" }, { status: 409 });
  }
  if (String(move.approval_code) !== code) {
    return NextResponse.json({ ok: false, error: "bad_code" }, { status: 200 });
  }

  await admin
    .from("cash_moves")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", moveId);

  return NextResponse.json({ ok: true });
}
