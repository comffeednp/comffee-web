import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Cpu } from "lucide-react";
import { getBranchBySlug } from "@/lib/branches";
import { getPCStationsForBranch } from "@/lib/pc-stations";
import { getReservableRatesForBranch } from "@/lib/branch-rates";
import {
  getBranchPaymentConfig,
  getBranchPaymentDisplay,
  isPaymongoReservationActive,
} from "@/lib/branch-payment-config";
import { getSupabaseServer } from "@/lib/supabase/server";
import { googleSignInAction, switchAccountAction } from "@/app/(site)/account/_actions/auth";
import { SubmitButton, LoadingLink } from "@/components/partner/GateButtons";
import ReservePCClient from "./ReservePCClient";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Flat reservation fee (flowchart §E/§F/§G). Hardcoded — NOT the per-₱100 counter fee, and NOT
// stored in config — so the website and POS can never drift on this number.
const RESERVATION_FEE_PHP = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  return {
    title: branch ? `Reserve a PC at ${branch.name}` : "Reserve",
    description: branch?.tagline ?? undefined,
  };
}

export default async function ReservePCPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pc?: string; go?: string }>;
}) {
  const { slug } = await params;
  const { pc: requestedPc, go } = await searchParams;
  const branch = await getBranchBySlug(slug);
  // 404 a deep-link to /reserve-pc when the branch isn't a reservable cafe type. (Playcation
  // branches book via /playcation/<slug>/book, not here.)
  if (!branch || (branch.type !== "cafe" && branch.type !== "partner_cafe")) notFound();

  // Online reservations are PayMongo-only (Chunk 5). If the branch's active online-payment method
  // isn't 'paymongo', the public branch page hides the CTA and a deep link here 404s. We read the
  // config with the service role (it holds secrets) but only use the method flag + the non-secret
  // display subset below.
  const paymentConfig = await getBranchPaymentConfig(branch.id);
  if (!isPaymongoReservationActive(paymentConfig)) notFound();
  const display = await getBranchPaymentDisplay(branch.id);

  // Google sign-in is REQUIRED to reserve (flowchart §F/§G/§K). Read the session (anon client +
  // cookies → RLS). Mirrors the partner attendance gate.
  const supa = await getSupabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  const backToBranch = (
    <Link
      href={`/branches/${branch.slug}`}
      title="Back to branch page"
      className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
    >
      <ArrowLeft className="h-3 w-3" />
      Back to {branch.name}
    </Link>
  );

  // Not signed in → Google sign-in gate, returning to THIS page (with ?go=1 to skip straight in).
  if (!user) {
    return (
      <section className="container-edge py-16 md:py-24">
        {backToBranch}
        <div className="mt-10 mx-auto w-[min(92vw,26rem)] rounded-2xl border border-line-bright bg-bg-card p-8 text-center">
          <Cpu className="mx-auto h-8 w-8 text-amber" />
          <h1 className="mt-4 font-display text-2xl font-bold text-cream">
            Reserve a PC at {branch.name}
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Sign in with your Google account to reserve a station online.
          </p>
          <form action={googleSignInAction} className="mt-6">
            <input
              type="hidden"
              name="next"
              value={`/branches/${slug}/reserve-pc?go=1${requestedPc ? `&pc=${encodeURIComponent(requestedPc)}` : ""}`}
            />
            <SubmitButton
              title="Sign in with Google to reserve a PC"
              pendingText="Opening Google…"
              className="w-full rounded-xl bg-amber px-4 py-3 text-sm font-bold text-bg transition hover:brightness-110"
            >
              Continue with Google
            </SubmitButton>
          </form>
        </div>
      </section>
    );
  }

  // Signed in but this visit hasn't been confirmed (no ?go=1) → show WHO is signed in and let them
  // continue or switch, so a leftover session on a shared phone doesn't silently reserve as the
  // wrong account (same safeguard as the attendance page).
  if (go !== "1") {
    return (
      <section className="container-edge py-16 md:py-24">
        {backToBranch}
        <div className="mt-10 mx-auto w-[min(92vw,26rem)] rounded-2xl border border-line-bright bg-bg-card p-8 text-center">
          <Cpu className="mx-auto h-8 w-8 text-amber" />
          <h1 className="mt-4 font-display text-2xl font-bold text-cream">
            Reserve a PC at {branch.name}
          </h1>
          <p className="mt-2 text-sm text-cream-dim">Signed in as</p>
          <p className="mt-0.5 truncate text-sm font-bold text-cream" title={user.email ?? ""}>
            {user.email}
          </p>
          <LoadingLink
            href={`/branches/${slug}/reserve-pc?go=1${requestedPc ? `&pc=${encodeURIComponent(requestedPc)}` : ""}`}
            title="Continue as this account"
            pendingText="Loading…"
            className="mt-6 block w-full rounded-xl bg-amber px-4 py-3 text-center text-sm font-bold text-bg transition hover:brightness-110"
          >
            Continue
          </LoadingLink>
          <form action={switchAccountAction} className="mt-3">
            <input
              type="hidden"
              name="next"
              value={`/branches/${slug}/reserve-pc${requestedPc ? `?pc=${encodeURIComponent(requestedPc)}` : ""}`}
            />
            <SubmitButton
              title="Sign out and choose a different Google account"
              pendingText="Switching…"
              className="w-full rounded-xl border border-line-bright px-4 py-2.5 text-sm font-semibold text-cream-dim transition hover:text-cream"
            >
              Use a different account
            </SubmitButton>
          </form>
        </div>
      </section>
    );
  }

  const [snapshot, allRates] = await Promise.all([
    getPCStationsForBranch(branch.id),
    getReservableRatesForBranch(branch.id),
  ]);

  // Find the requested PC (if any) so we can pre-select + pass its tier
  const requestedStation = requestedPc
    ? snapshot.stations.find((s) => s.station_name === requestedPc)
    : null;

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          {backToBranch}
          <div className="mt-6">
            <p className="terminal-label">/reserve-pc</p>
            <h1 className="mt-3 font-display text-4xl md:text-6xl font-bold leading-[0.95] tracking-tight text-cream">
              Claim a station.
            </h1>
            <p className="mt-3 text-cream-dim text-lg max-w-2xl">
              Tap a vacant PC, pick your rate, pay online. A flat ₱{RESERVATION_FEE_PHP} reservation
              fee applies. 10-minute grace window to show up once you&apos;ve paid.
            </p>
          </div>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16">
        <ReservePCClient
          branch={{
            id: branch.id,
            slug: branch.slug,
            name: branch.name,
          }}
          stations={snapshot.stations.map((s) => ({
            id: s.id,
            name: s.station_name,
            isOccupied: s.is_occupied,
            tier: (s as unknown as { pc_tier?: string | null }).pc_tier ?? null,
            currentSessionEndsAt: s.current_session_ends_at,
            isMemberSession: s.is_member_session,
          }))}
          rates={allRates.map((r) => ({
            id: r.id,
            label: r.label,
            description: r.description,
            pricePhp: Number(r.price_php),
            unit: r.unit,
            tier: r.pc_tier ?? null,
            durationMinutes: r.duration_minutes ?? 60,
            timeWindowStart: r.time_window_start,
            timeWindowEnd: r.time_window_end,
          }))}
          requestedPc={requestedStation?.station_name ?? null}
          requestedTier={(requestedStation as unknown as { pc_tier?: string | null } | undefined)?.pc_tier ?? null}
          reservationFeePhp={RESERVATION_FEE_PHP}
          signedInEmail={user.email ?? null}
          minHours={display?.reservationMinHours ?? 1}
          minTopup={display?.reservationMinTopup ?? 0}
          bonus={{
            type: display?.bonusType ?? "percent",
            value: display?.bonusValue ?? 0,
            threshold: display?.bonusThreshold ?? 0,
          }}
        />
      </section>
    </>
  );
}
