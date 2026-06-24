import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { Coffee } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { googleSignInAction, switchAccountAction } from "@/app/(site)/account/_actions/auth";
import { isInAppBrowser } from "@/lib/in-app-browser";
import WebviewNotice from "@/components/site/WebviewNotice";
import AttendanceClient from "@/components/partner/AttendanceClient";
import { SubmitButton, LoadingLink } from "@/components/partner/GateButtons";
import type { AttendanceStatus } from "@/lib/supabase/types";

// Always fresh: geofence config (radius / required) can change in the POS admin,
// and we read it with the service role (so it works even for branches that aren't
// published on the marketing site yet). Hence no SSG / generateStaticParams.
export const dynamic = "force-dynamic";

async function getBranchAttendance(slug: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("branches")
    .select("id, name, slug, lat, lng, geofence_radius_m, geofence_required")
    .eq("slug", slug)
    .maybeSingle();
  return data as {
    id: string;
    name: string;
    slug: string;
    lat: number | null;
    lng: number | null;
    geofence_radius_m: number;
    geofence_required: boolean;
  } | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchAttendance(slug);
  return {
    title: branch ? `Clock In — ${branch.name}` : "Attendance",
    // Staff-only page — keep it out of search engines (defense-in-depth with robots.ts).
    robots: { index: false, follow: false },
  };
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ go?: string }>;
}) {
  const { slug } = await params;
  const { go } = await searchParams;
  const branch = await getBranchAttendance(slug);
  if (!branch) notFound();

  // Google sign-in is REQUIRED. Read the session (anon client + cookies → RLS).
  const supa = await getSupabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  // Not signed in → render the Google sign-in gate, returning to THIS page after.
  if (!user) {
    // Staff identity IS their Google account (the account chooser below is forced), so there's no email
    // fallback here — but Google blocks OAuth inside in-app browsers (Messenger/FB/IG). Detect that and
    // tell the staffer to open this page in a real browser, where Google works.
    const webview = isInAppBrowser((await headers()).get("user-agent"));
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-bg p-6">
        <div className="w-[min(92vw,24rem)] rounded-2xl border border-line-bright bg-bg-elev p-7 text-center">
          <Coffee className="mx-auto h-8 w-8 text-amber" />
          <h1 className="mt-4 font-display text-lg font-bold text-cream">
            {branch.name} — Staff Clock In
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Sign in with your Google account to clock in or out.
          </p>
          {webview.inApp && <WebviewNotice appName={webview.name} />}
          <form action={googleSignInAction} className="mt-6">
            <input
              type="hidden"
              name="next"
              value={`/partners/${slug}/attendance?go=1`}
            />
            {/* Force Google's account chooser so it never silently picks the one signed-in
                account — each staffer must pick their own on this shared clock-in phone. */}
            <input type="hidden" name="prompt" value="select_account" />
            <SubmitButton
              title="Sign in with Google to clock in"
              pendingText="Opening Google…"
              className="w-full rounded-xl bg-amber px-4 py-3 text-sm font-bold text-bg transition hover:brightness-110"
            >
              Continue with Google
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  // Signed in but this scan hasn't been confirmed yet (no ?go=1). Show WHO is signed in and
  // let them either continue or switch — so a leftover session on a shared/first-time phone
  // never silently clocks in (or self-registers) as the wrong Google account.
  if (go !== "1") {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-bg p-6">
        <div className="w-[min(92vw,24rem)] rounded-2xl border border-line-bright bg-bg-elev p-7 text-center">
          <Coffee className="mx-auto h-8 w-8 text-amber" />
          <h1 className="mt-4 font-display text-lg font-bold text-cream">
            {branch.name} — Staff Clock In
          </h1>
          <p className="mt-2 text-sm text-cream-dim">Signed in as</p>
          <p className="mt-0.5 truncate text-sm font-bold text-cream" title={user.email ?? ""}>
            {user.email}
          </p>
          <LoadingLink
            href={`/partners/${slug}/attendance?go=1`}
            title="Continue as this account"
            pendingText="Loading…"
            className="mt-6 block w-full rounded-xl bg-amber px-4 py-3 text-center text-sm font-bold text-bg transition hover:brightness-110"
          >
            Continue
          </LoadingLink>
          <form action={switchAccountAction} className="mt-3">
            <input type="hidden" name="next" value={`/partners/${slug}/attendance`} />
            <SubmitButton
              title="Sign out and choose a different Google account"
              pendingText="Switching…"
              className="w-full rounded-xl border border-line-bright px-4 py-2.5 text-sm font-semibold text-cream-dim transition hover:text-cream"
            >
              Use a different account
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  // Signed in → ensure a branch_staff row exists for this Google account at this
  // branch (self-register, stays 'pending' until a POS admin approves). Service
  // role bypasses RLS for the upsert. Matched on (branch_id, email).
  const email = (user.email ?? "").toLowerCase();
  const admin = getSupabaseAdmin();
  const { data: staff } = await admin
    .from("branch_staff")
    .select("id, status, face_descriptor, name, face_consent_version")
    .eq("branch_id", branch.id)
    .eq("email", email)
    .maybeSingle();

  let status: AttendanceStatus = (staff?.status as AttendanceStatus) ?? "pending";
  let enrolled = !!staff?.face_descriptor;
  let consentVersion: number | null = staff?.face_consent_version ?? null;

  if (!staff) {
    const name =
      (user.user_metadata?.full_name as string) ??
      (user.user_metadata?.name as string) ??
      email.split("@")[0] ??
      "Staff";
    const { data: inserted } = await admin
      .from("branch_staff")
      .insert({
        branch_id: branch.id,
        auth_user_id: user.id,
        email,
        name,
        status: "pending",
      })
      .select("status, face_descriptor, face_consent_version")
      .maybeSingle();
    status = (inserted?.status as AttendanceStatus) ?? "pending";
    enrolled = false;
    consentVersion = inserted?.face_consent_version ?? null;
  }

  // Latest clock punch (if any) so the Clock In / Clock Out button is correct on the FIRST paint —
  // without this the client only learns the shift state a couple seconds AFTER load, so an already-
  // clocked-in staffer briefly sees "Clock In". Read fresh server-side (force-dynamic), the same
  // source the live status poll uses. A brand-new self-registered staffer (no row yet) has no
  // punches → stays null → button defaults to "Clock In", which is right for them.
  let initialClockType: string | null = null;
  let initialClockAt: string | null = null;
  if (staff?.id) {
    const { data: lastPunch } = await admin
      .from("attendance_records")
      .select("clock_type, recorded_at")
      .eq("staff_id", staff.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    initialClockType = lastPunch?.clock_type ?? null;
    initialClockAt = lastPunch?.recorded_at ?? null;
  }

  return (
    <AttendanceClient
      slug={branch.slug}
      branchName={branch.name}
      lat={branch.lat}
      lng={branch.lng}
      radiusM={branch.geofence_radius_m}
      geofenceRequired={branch.geofence_required}
      email={email}
      status={status}
      enrolled={enrolled}
      consentVersion={consentVersion}
      initialClockType={initialClockType}
      initialClockAt={initialClockAt}
    />
  );
}
