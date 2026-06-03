import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { FACE_CONSENT_VERSION } from "@/lib/face-consent";

// One-time face-scan acknowledgment. The signed-in Google user records that they understand face
// scan is the only clock-in method BEFORE their first enrollment. Stored on the staff's own
// branch_staff row via the service role (same trust model as enroll/route.ts: clients never write
// branch_staff directly). Idempotent — re-acking the same/lower version is a harmless no-op write.
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

  const rl = checkRateLimit(`attendance-ack:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
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
    .select("id, status")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "no_staff_row" }, { status: 404 });
  }
  if (staff.status === "rejected" || staff.status === "disabled") {
    return NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 });
  }

  // Audit IP best-effort (proxy header first, same pattern the clock route uses for verified_ip).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const { error: updErr } = await admin
    .from("branch_staff")
    .update({
      face_consent_version: FACE_CONSENT_VERSION,
      face_consent_acked_at: new Date().toISOString(),
      face_consent_acked_ip: ip,
      updated_at: new Date().toISOString(),
    })
    .eq("id", staff.id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: "save_failed", detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, consentVersion: FACE_CONSENT_VERSION });
}
