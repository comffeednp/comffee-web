import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { euclideanDistance, isValidDescriptor } from "@/lib/face-match";
import { evaluateClockGate, nextClockType } from "@/lib/attendance-gate";
import { haversineMeters } from "@/lib/geo";
import { checkRateLimit } from "@/lib/rate-limit";

const BUCKET = "attendance-selfies";

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

// The clock-in/out gate. Every independent check that the design promised is RE-DONE
// here on the server (the client can be forged): signed-in Google user, approved staff,
// device binding (blocks a second phone), server face match, server geofence. Liveness
// itself is computed in the browser — we keep the audit selfie + assert the challenge
// set was non-trivial; true liveness is a paid SDK if ever needed. Auto in/out: the
// previous record decides direction so staff never pick (matches the POS).
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

  // Anti-spam: a few clocks per 5 min is plenty (a real in/out pair is minutes apart).
  const rl = checkRateLimit(`attendance-clock:${user.id}`, 5, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData();
  const selfie = form.get("selfie");
  const descriptorRaw = form.get("descriptor");
  const challengesRaw = form.get("challenges");
  const deviceToken = String(form.get("deviceToken") ?? "").trim();
  const coveringForRaw = String(form.get("coveringFor") ?? "").trim();
  const gpsLat = form.get("lat") != null ? Number(form.get("lat")) : null;
  const gpsLng = form.get("lng") != null ? Number(form.get("lng")) : null;
  const gpsAcc = form.get("accuracy") != null ? Number(form.get("accuracy")) : null;

  if (!(selfie instanceof Blob) || typeof descriptorRaw !== "string" || !deviceToken) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  let descriptor: unknown;
  let challenges: unknown;
  try {
    descriptor = JSON.parse(descriptorRaw);
    challenges = challengesRaw ? JSON.parse(String(challengesRaw)) : [];
  } catch {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }
  if (!isValidDescriptor(descriptor)) {
    return NextResponse.json({ ok: false, error: "bad_descriptor" }, { status: 400 });
  }
  // Liveness sanity: the browser must have run at least 2 challenges (blink + a turn).
  if (!Array.isArray(challenges) || challenges.length < 2) {
    return NextResponse.json({ ok: false, error: "liveness_incomplete" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const email = user.email.toLowerCase();

  const { data: branch } = await admin
    .from("branches")
    .select("id, lat, lng, geofence_radius_m, geofence_required")
    .eq("slug", slug)
    .maybeSingle();
  if (!branch) {
    return NextResponse.json({ ok: false, error: "branch_not_found" }, { status: 404 });
  }

  const { data: staff } = await admin
    .from("branch_staff")
    .select("id, status, face_descriptor")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "no_staff_row" }, { status: 404 });
  }
  // ── Gather the facts the decision needs ──
  // Device binding: one phone per staff (bind on first clock; block any other).
  const { data: binding } = await admin
    .from("device_bindings")
    .select("id, device_token")
    .eq("staff_id", staff.id)
    .maybeSingle();

  const enrolled = isValidDescriptor(staff.face_descriptor);
  // Face distance vs the enrolled face (∞ if not enrolled → the gate denies it).
  const faceDist = enrolled
    ? euclideanDistance(descriptor, staff.face_descriptor)
    : Number.POSITIVE_INFINITY;

  // Geofence distance, recomputed server-side (never trust the client's "inside" flag).
  let distanceM: number | null = null;
  if (branch.lat != null && branch.lng != null && gpsLat != null && gpsLng != null) {
    distanceM = haversineMeters(branch.lat, branch.lng, gpsLat, gpsLng);
  }

  // ── The decision (pure, loop-tested in attendance-gate.test.ts) ──
  const gate = evaluateClockGate({
    staffStatus: staff.status,
    enrolled,
    challengesCount: challenges.length,
    deviceBound: !!binding,
    deviceMatches: !!binding && binding.device_token === deviceToken,
    faceDistance: faceDist,
    geofenceRequired: branch.geofence_required,
    haveLocation: gpsLat != null && gpsLng != null,
    distanceM,
    radiusM: branch.geofence_radius_m,
  });
  if (!gate.ok) {
    // All gate denials are 403 (bad input / incomplete liveness were already 400'd above).
    const extra =
      gate.error === "face_mismatch"
        ? { score: faceDist }
        : gate.error === "outside_geofence"
          ? { distance: distanceM }
          : {};
    return NextResponse.json({ ok: false, error: gate.error, ...extra }, { status: 403 });
  }

  // ── Auto in/out: the previous record decides direction ──
  const { data: last } = await admin
    .from("attendance_records")
    .select("clock_type, recorded_at")
    .eq("staff_id", staff.id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Idempotency window (2026-05-29): if this staffer clocked just seconds ago, treat this request as
  // a DUPLICATE — a double-tap, a slow-network retry, or a page reload firing the action again — and
  // return that SAME state WITHOUT inserting a new record. This is what stops the "reloaded and got
  // suddenly clocked OUT" bug: without it, a second press toggles clock_in → clock_out within seconds
  // and looks like a 0-minute shift. No legitimate in→out pair happens within 30s, so this is safe.
  if (last?.recorded_at) {
    const sinceMs = Date.now() - new Date(last.recorded_at).getTime();
    if (sinceMs >= 0 && sinceMs < 30_000) {
      return NextResponse.json({ ok: true, clock_type: last.clock_type, deduped: true });
    }
  }

  const clockType = nextClockType(last?.clock_type);

  // Reliever: on a clock-IN the worker may flag WHO they're covering for (a sudden absence). The
  // client list can be forged → re-validate it's a real APPROVED staffer at THIS branch, not self.
  let coveringForId: string | null = null;
  if (clockType === "clock_in" && coveringForRaw) {
    const { data: cov } = await admin
      .from("branch_staff")
      .select("id")
      .eq("id", coveringForRaw)
      .eq("branch_id", branch.id)
      .eq("status", "approved")
      .maybeSingle();
    if (cov && cov.id !== staff.id) coveringForId = cov.id;
  }

  // ── Store the audit selfie ──
  const now = new Date();
  const path = `${branch.id}/records/${staff.id}/${now.getTime()}.jpg`;
  const buffer = Buffer.from(await selfie.arrayBuffer());
  await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: false });

  // ── Insert the record ── (PRIVATE bucket: store the path; sign on read in the POS)
  const { error: insErr } = await admin.from("attendance_records").insert({
    branch_id: branch.id,
    staff_id: staff.id,
    clock_type: clockType,
    recorded_at: now.toISOString(),
    selfie_url: path,
    face_match_score: faceDist,
    gps_lat: gpsLat,
    gps_lng: gpsLng,
    gps_accuracy_m: gpsAcc,
    distance_m: distanceM,
    verified_ip: clientIp(req),
    device_token: deviceToken,
    covering_for_staff_id: coveringForId,
  });
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: "record_failed", detail: insErr.message },
      { status: 500 },
    );
  }

  // ── Bind device on first clock / refresh last_seen ──
  if (!binding) {
    await admin.from("device_bindings").insert({
      staff_id: staff.id,
      device_token: deviceToken,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      last_seen_at: now.toISOString(),
    });
  } else {
    await admin
      .from("device_bindings")
      .update({ last_seen_at: now.toISOString() })
      .eq("id", binding.id);
  }

  // ── End-of-shift cleanup (Chunk C, 2026-05-29) ──
  // On clock-out, auto-cancel any still-pending in-store GCash QRs scoped to this staffer so a
  // stale QR doesn't carry over to the next shift. Best-effort: failures here don't block the
  // clock-out, and the POS-side variance math doesn't read this table anyway.
  if (clockType === "clock_out") {
    await admin
      .from("pos_active_payment_qrs")
      .update({
        status: "cancelled",
        cancelled_at: now.toISOString(),
        cancelled_reason: "cashier_clocked_out",
      })
      .eq("cashier_staff_id", staff.id)
      .eq("status", "pending");
  }

  return NextResponse.json({ ok: true, clock_type: clockType, distance: distanceM });
}
