import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Live status poll. The attendance page reads status ONCE on load, so after a POS admin
// approves a staffer the page would otherwise stay on "waiting for approval" until a manual
// reload. The client polls this every few seconds and flips to the clock-in flow on its own.
// Read-only, scoped to the signed-in Google account's own row at this branch.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const deviceToken = req.nextUrl.searchParams.get("device") ?? "";

  const supa = await getSupabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
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
    .select("id, status, face_descriptor")
    .eq("branch_id", branch.id)
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  // Latest clock record → drives the button: clocked IN now (last was clock_in) vs OUT, and
  // WHEN they clocked in (so the client can show a live running timer).
  let lastClockType: string | null = null;
  let lastClockAt: string | null = null;
  if (staff?.id) {
    const { data: last } = await admin
      .from("attendance_records")
      .select("clock_type, recorded_at")
      .eq("staff_id", staff.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastClockType = last?.clock_type ?? null;
    lastClockAt = last?.recorded_at ?? null;
  }

  // Device state for THIS phone: "this" = this phone is the registered one, "other" = a
  // different phone is registered (so this one is blocked — drives the "registered to another
  // phone" screen), "none" = no phone registered yet → must verify face to register this one.
  let deviceState: "this" | "other" | "none" = "none";
  if (staff?.id) {
    const { data: binding } = await admin
      .from("device_bindings")
      .select("device_token")
      .eq("staff_id", staff.id)
      .maybeSingle();
    if (binding) deviceState = deviceToken && binding.device_token === deviceToken ? "this" : "other";
  }

  // Reliever button gating. The website "covering for an absent co-worker" picker appears ONLY when
  // (A) this approved staffer has NO shift today, AND (B) a scheduled co-worker hasn't clocked in.
  // coworkers = exactly those absent scheduled people (to pick from); empty list = hide the button.
  // The roster lives in the POS and is synced UP to staff_shifts; "today" = Asia/Manila. The /clock
  // route re-validates the chosen id server-side.
  let coworkers: { id: string; name: string }[] = [];
  if (staff?.id && staff.status === "approved") {
    const phToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const { data: myShift } = await admin
      .from("staff_shifts")
      .select("id")
      .eq("staff_id", staff.id)
      .eq("date", phToday)
      .maybeSingle();
    if (!myShift) {
      // (A) holds — I have no shift today. Now find scheduled co-workers who haven't clocked in (B).
      const { data: scheduled } = await admin
        .from("staff_shifts")
        .select("staff_id")
        .eq("branch_id", branch.id)
        .eq("date", phToday)
        .neq("staff_id", staff.id);
      const scheduledIds = (scheduled ?? []).map((s) => s.staff_id as string);
      if (scheduledIds.length) {
        const dayStartUtc = new Date(`${phToday}T00:00:00+08:00`).toISOString();
        const { data: ins } = await admin
          .from("attendance_records")
          .select("staff_id")
          .eq("branch_id", branch.id)
          .eq("clock_type", "clock_in")
          .gte("recorded_at", dayStartUtc);
        const clockedIn = new Set((ins ?? []).map((r) => r.staff_id as string));
        const absentIds = scheduledIds.filter((id) => !clockedIn.has(id));
        if (absentIds.length) {
          const { data: names } = await admin
            .from("branch_staff")
            .select("id, name")
            .in("id", absentIds);
          coworkers = (names ?? []).map((n) => ({ id: n.id as string, name: n.name as string }));
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    status: staff?.status ?? "pending",
    enrolled: !!staff?.face_descriptor,
    lastClockType,
    lastClockAt,
    deviceState,
    coworkers,
  });
}
