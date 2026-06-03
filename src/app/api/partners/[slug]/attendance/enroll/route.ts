import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidDescriptor } from "@/lib/face-match";
import { checkRateLimit } from "@/lib/rate-limit";
import { FACE_CONSENT_VERSION } from "@/lib/face-consent";

const BUCKET = "attendance-selfies";

// Face enrollment. The descriptor is computed in the browser (face-api); this route
// trusts the SIGNED-IN Google user owns the staff row, validates the descriptor shape,
// stores the selfie + descriptor via the service role. Approval to actually CLOCK is a
// separate POS-admin step — enrolling while 'pending' is allowed so the face is ready.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Must be signed in (Google).
  const supa = await getSupabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  }

  const rl = checkRateLimit(`attendance-enroll:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData();
  const selfie = form.get("selfie");
  const descriptorRaw = form.get("descriptor");
  const deviceToken = String(form.get("deviceToken") ?? "").trim();
  if (!(selfie instanceof Blob) || typeof descriptorRaw !== "string") {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  let descriptor: unknown;
  try {
    descriptor = JSON.parse(descriptorRaw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_descriptor" }, { status: 400 });
  }
  if (!isValidDescriptor(descriptor)) {
    return NextResponse.json({ ok: false, error: "bad_descriptor" }, { status: 400 });
  }
  if (selfie.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "selfie_too_large" }, { status: 400 });
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
    .select("id, status, face_consent_version")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "no_staff_row" }, { status: 404 });
  }
  if (staff.status === "rejected" || staff.status === "disabled") {
    return NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 });
  }
  // Server-side enforcement of the face-scan acknowledgment (owner decision: enforce on the server,
  // not just the phone screen). No face is enrolled until this staffer has acknowledged the CURRENT
  // consent version. The client gate normally prevents reaching here, but a crafted direct POST
  // would otherwise bypass it — this makes the acknowledgment a real precondition, not just UI.
  if (
    staff.face_consent_version == null ||
    staff.face_consent_version < FACE_CONSENT_VERSION
  ) {
    return NextResponse.json({ ok: false, error: "ack_required" }, { status: 403 });
  }

  // ONE phone per staff, locked at enrollment (so the phone is bound before approval, not
  // only at first clock-in). If a DIFFERENT phone is already bound, block — they must use that
  // phone or have the admin reset the device on the POS. Same phone re-enrolling is fine.
  const { data: binding } = await admin
    .from("device_bindings")
    .select("id, device_token")
    .eq("staff_id", staff.id)
    .maybeSingle();
  if (deviceToken && binding && binding.device_token !== deviceToken) {
    return NextResponse.json({ ok: false, error: "device_mismatch" }, { status: 403 });
  }

  // Cross-identity guard (mirror of the /clock route): never let THIS staffer enroll a phone that is
  // already bound to a DIFFERENT staff. Without it, two people (or one person with two Gmails — the
  // Kalhel case) can both bind the same phone, which corrupts the one-phone-per-person rule and then
  // LOCKS BOTH out of clocking. The admin must reset that phone first. limit(1)+array (not
  // maybeSingle) so a duplicate row can never throw, and the error is CHECKED, never swallowed.
  if (deviceToken) {
    const { data: otherBindings, error: otherErr } = await admin
      .from("device_bindings")
      .select("staff_id, branch_staff!inner(name)")
      .eq("device_token", deviceToken)
      .neq("staff_id", staff.id)
      .limit(1);
    if (otherErr) {
      return NextResponse.json({ ok: false, error: "device_check_failed" }, { status: 500 });
    }
    if (otherBindings && otherBindings.length) {
      const ob = otherBindings[0] as unknown as { branch_staff?: { name?: string } };
      return NextResponse.json(
        {
          ok: false,
          error: "device_belongs_to_other",
          detail: `This phone is already registered to ${ob.branch_staff?.name ?? "another staff account"}. Ask your admin to reset it first.`,
        },
        { status: 403 },
      );
    }
  }

  // Store the selfie (one canonical enrollment image per staff; overwrite on re-enroll).
  const buffer = Buffer.from(await selfie.arrayBuffer());
  const path = `${branch.id}/${staff.id}.jpg`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: "upload_failed", detail: upErr.message },
      { status: 500 },
    );
  }
  // PRIVATE bucket: store the storage PATH (not a public URL). Whoever displays it
  // (the POS admin, Phase D) generates a short-lived signed URL via the service role.
  const { error: updErr } = await admin
    .from("branch_staff")
    .update({
      face_descriptor: descriptor,
      selfie_url: path,
      updated_at: new Date().toISOString(),
    })
    .eq("id", staff.id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: "save_failed", detail: updErr.message },
      { status: 500 },
    );
  }

  // First phone to enroll → bind it now. (If this insert ever fails, first clock-in still
  // binds as a backstop — the clock route does the same insert.)
  if (deviceToken && !binding) {
    const { error: bindErr } = await admin.from("device_bindings").insert({
      staff_id: staff.id,
      device_token: deviceToken,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      last_seen_at: new Date().toISOString(),
    });
    if (bindErr) console.error("enroll device-bind failed", bindErr.message);
  }

  return NextResponse.json({ ok: true });
}
