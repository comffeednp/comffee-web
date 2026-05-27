import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const BUCKET = "payment-receipts";

// Online payment (GCash) receipt upload from the clock-in page — replaces the in-shop QR scanner.
// An APPROVED staffer (the on-duty cashier, signed in with Google) uploads the photo here; it's
// stored + queued in payment_receipts (status 'pending'), and the POS — subscribed via Realtime —
// is PUSHED the new row, downloads the image, runs OCR + dedup + reconciliation against that
// cashier's open shift, then deletes the row + image. Service-role write only (no public/anon write).
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

  // A busy shift can have many receipts; 30/hour per staffer is plenty and blocks abuse.
  const rl = checkRateLimit(`payment-receipt:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData();
  const image = form.get("image");
  const kind = String(form.get("kind") ?? "gcash") === "cash_movement" ? "cash_movement" : "gcash";
  const mvRaw = String(form.get("movementType") ?? "");
  const movementType = kind === "cash_movement" && ["drop", "pickup", "expense"].includes(mvRaw) ? mvRaw : null;
  if (!(image instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "missing_image" }, { status: 400 });
  }
  if (image.size > 6 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 400 });
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

  // Only an APPROVED staffer at this branch may upload (they're the on-duty cashier). The POS binds
  // the receipt to whichever open shift that person owns.
  const { data: staff } = await admin
    .from("branch_staff")
    .select("id, status")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "no_staff_row" }, { status: 404 });
  }
  if (staff.status !== "approved") {
    return NextResponse.json({ ok: false, error: "not_approved" }, { status: 403 });
  }

  // Only the on-duty (currently clocked-in) staffer may upload — a clocked-out / off-shift worker must
  // not add receipts to a shift. The latest attendance record must be a clock_in.
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

  const buffer = Buffer.from(await image.arrayBuffer());
  const path = `${branch.id}/${staff.id}/${Date.now()}.jpg`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: "upload_failed", detail: upErr.message },
      { status: 500 },
    );
  }

  const { error: insErr } = await admin.from("payment_receipts").insert({
    branch_id: branch.id,
    staff_id: staff.id,
    kind,
    movement_type: movementType,
    image_path: path,
    status: "pending",
  });
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: "save_failed", detail: insErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
