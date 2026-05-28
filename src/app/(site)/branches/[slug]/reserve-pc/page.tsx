import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getBranchBySlug } from "@/lib/branches";
import { getPCStationsForBranch } from "@/lib/pc-stations";
import { getReservableRatesForBranch } from "@/lib/branch-rates";
import ReservePCClient from "./ReservePCClient";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ pc?: string }>;
}) {
  const { slug } = await params;
  const { pc: requestedPc } = await searchParams;
  const branch = await getBranchBySlug(slug);
  // 404 a deep-link to /reserve-pc when the branch doesn't accept online reservations (Stage 6
  // owner toggle). The public branch page already hides the CTA; this guards the direct-URL case.
  if (!branch || (branch.type !== "cafe" && branch.type !== "partner_cafe")) notFound();
  if (!branch.reservations_enabled) notFound();

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
          <Link
            href={`/branches/${branch.slug}`}
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to {branch.name}
          </Link>
          <div className="mt-6">
            <p className="terminal-label">/reserve-pc</p>
            <h1 className="mt-3 font-display text-4xl md:text-6xl font-bold leading-[0.95] tracking-tight text-cream">
              Claim a station.
            </h1>
            <p className="mt-3 text-cream-dim text-lg max-w-2xl">
              Tap a vacant PC, pick your rate, walk in. 30-minute grace window to physically show up.
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
        />
      </section>
    </>
  );
}
