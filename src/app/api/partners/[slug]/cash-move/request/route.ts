import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendCashMoveApprovalCode } from "@/lib/email";

const BUCKET = "payment-receipts";
// Where the 6-digit approval code is emailed (the owner, who relays it to the worker). Defaults to the
// owner's Gmail; override per deployment with APPROVAL_EMAIL_TO.
const OWNER_EMAIL = process.env.APPROVAL_EMAIL_TO ?? "johnjosephtopacio@gmail.com";

// Step 1 of a website cash move (drop/pickup/expense): an APPROVED on-duty staffer enters type +
// amount + reason (+ optional photo). We store it 'pending_code' with a fresh 6-digit code and EMAIL
// the code to the owner. The worker then verifies (step 2) with the code the owner relays — only then
// does it become 'approved' and the POS pulls + records it. Service-role only; the code is never
// returned to the client (RLS hides cash_moves from the public key entirely). See 0031_cash_moves.
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

  // A code emails the owner each time, so cap it tighter than receipts.
  const rl = checkRateLimit(`cash-move:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData();
  const type = String(form.get("type") ?? "");
  if (!["drop", "pickup", "expense"].includes(type)) {
    return NextResponse.json({ ok: false, error: "bad_type" }, { status: 400 });
  }
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "bad_amount" }, { status: 400 });
  }
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  if (type === "expense" && reason.length < 5) {
    return NextResponse.json({ ok: false, error: "reason_too_short" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const email = user.email.toLowerCase();

  const { data: branch } = await admin
    .from("branches")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!branch) {
    return NextResponse.json({ ok: false, error: "branch_not_found" }, { status: 404 });
  }

  // Only an APPROVED staffer at this branch may record a move (they're the on-duty cashier). The POS
  // binds the move to whichever open shift that person owns.
  const { data: staff } = await admin
    .from("branch_staff")
    .select("id, name, status")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "no_staff_row" }, { status: 404 });
  }
  if (staff.status !== "approved") {
    return NextResponse.json({ ok: false, error: "not_approved" }, { status: 403 });
  }

  // Only the on-duty (currently clocked-in) staffer may record a cash move — a clocked-out / off-shift
  // worker must not add cash moves to a shift. The latest attendance record must be a clock_in.
  const { data: lastClock } = await admin
    .from("attendance_records")
    .select("clock_type")
    .eq("staff_id", staff.id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastClock?.clock_type !== "clock_in") {
    return NextResponse.json({ ok: false, error: "not_on_shift" }, { status: 403 });
  }

  // Optional photo (a cash drop often has no receipt). Stored in the same private receipts bucket.
  let imagePath: string | null = null;
  const image = form.get("image");
  if (image instanceof Blob && image.size > 0) {
    if (image.size > 6 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 400 });
    }
    const buffer = Buffer.from(await image.arrayBuffer());
    const path = `cashmove/${branch.id}/${staff.id}/${Date.now()}.jpg`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "upload_failed", detail: upErr.message },
        { status: 500 },
      );
    }
    imagePath = path;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const { data: inserted, error: insErr } = await admin
    .from("cash_moves")
    .insert({
      branch_id: branch.id,
      staff_id: staff.id,
      type,
      amount,
      reason,
      image_path: imagePath,
      status: "pending_code",
      approval_code: code,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: "save_failed", detail: insErr?.message },
      { status: 500 },
    );
  }

  const mail = await sendCashMoveApprovalCode({
    to: OWNER_EMAIL,
    type: type as "drop" | "pickup" | "expense",
    staffName: staff.name ?? email,
    branchName: branch.name ?? slug,
    amount,
    reason,
    code,
  });
  if (!mail.ok) {
    // The code couldn't be delivered → the worker can never approve it; remove the row so they retry.
    await admin.from("cash_moves").delete().eq("id", inserted.id);
    return NextResponse.json({ ok: false, error: "email_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, moveId: inserted.id });
}
