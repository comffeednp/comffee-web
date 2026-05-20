import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedBranches } from "@/lib/branches";
import BranchSplitHero from "@/components/site/BranchSplitHero";
import Reveal from "@/components/site/Reveal";
import { Cpu, Wifi, Coffee, Clock, Monitor } from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Internet Cafe",
  description:
    "Comffee Internet Cafe: high-spec gaming PCs, fiber internet, and great coffee by the hour.",
};

export default async function InternetCafePage() {
  const cafeBranches = await getPublishedBranches("cafe");

  return (
    <>
      {/* ============================================================
          HERO — title bar + split-panel branches
          ============================================================ */}
      <section className="bg-bg border-b border-line">
        {/* Title */}
        <div className="container-edge pt-14 pb-8 md:pt-20 md:pb-10">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="status-chip status-chip-amber">
              <Cpu className="h-3 w-3" />
              Internet Cafe
            </span>
            {cafeBranches.length > 0 && (
              <span className="status-chip">
                {cafeBranches.length.toString().padStart(2, "0")} locations open
              </span>
            )}
          </div>
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.9] font-bold tracking-tight text-cream">
            Comffee Internet Cafe
          </h1>
          <p className="mt-5 max-w-xl text-base md:text-lg text-cream-dim leading-relaxed">
            High-spec gaming PCs, fiber internet, and barista-grade coffee.
            Pay by the hour or grab a package — walk-in or reserve a station online.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="#locations" className="key-cap key-cap-primary">
              Find a location
            </Link>
            <Link href="/menu" className="key-cap">
              <Coffee className="h-4 w-4" />
              View menu
            </Link>
          </div>
        </div>

        {/* Branch panels */}
        <BranchSplitHero branches={cafeBranches} height="62svh" />
      </section>

      {/* ============================================================
          WHAT YOU GET
          ============================================================ */}
      <section className="relative py-24 md:py-32 bg-bg-soft border-b border-line">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="container-edge relative">
          <Reveal>
            <p className="terminal-label">included</p>
            <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream max-w-3xl">
              Just sit down and play.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Monitor,
                title: "High-spec gaming PCs",
                body: "Regular and VIP tiers. All machines maintained and ready.",
              },
              {
                icon: Wifi,
                title: "Fiber internet",
                body: "Low-latency wired connection at every station. No throttling.",
              },
              {
                icon: Coffee,
                title: "Coffee & drinks",
                body: "Espresso bar on-site. Order from your seat.",
              },
              {
                icon: Clock,
                title: "Hourly & packages",
                body: "Pay as you go, or grab a value pack. No surprises.",
              },
            ].map((it, i) => {
              const Icon = it.icon;
              return (
                <Reveal key={it.title} delay={i * 0.06}>
                  <div className="h-full p-6 border border-line-bright bg-bg-card rounded-xl hover:border-cream transition">
                    <Icon className="h-7 w-7 text-cream" strokeWidth={1.5} />
                    <h3 className="mt-4 text-lg font-semibold text-cream">{it.title}</h3>
                    <p className="mt-2 text-sm text-cream-dim leading-relaxed">{it.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================
          LOCATIONS
          ============================================================ */}
      <section id="locations" className="container-edge py-24 md:py-32">
        <Reveal>
          <p className="terminal-label">locations</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream max-w-3xl">
            Pick your spot.
          </h2>
          <p className="mt-5 max-w-2xl text-cream-dim text-lg">
            Check live station availability, see rates, and reserve a PC before you arrive.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cafeBranches.length === 0 && (
            <p className="text-cream-dim font-mono col-span-full">
              // no cafe locations published yet — check back soon
            </p>
          )}
          {cafeBranches.map((b, i) => (
            <Reveal key={b.id} delay={i * 0.05}>
              <Link
                href={`/branches/${b.slug}`}
                className="group block relative overflow-hidden rounded-xl border border-line-bright bg-bg-card hover:border-amber/60 hover:-translate-y-0.5 transition-all"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {b.hero_image_url ? (
                    <img
                      src={b.hero_image_url}
                      alt={b.name}
                      className="w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-bg-soft bg-grid" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
                  <span className="absolute top-3 left-3 status-chip">Internet Cafe</span>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-2xl font-bold text-cream group-hover:text-amber transition-colors">{b.name}</h3>
                  {b.tagline && <p className="mt-1.5 text-sm text-cream-dim line-clamp-2">{b.tagline}</p>}
                  <p className="mt-4 font-mono text-[0.62rem] uppercase tracking-widest text-amber">
                    Check availability →
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============================================================
          CTA
          ============================================================ */}
      <section className="relative py-24 md:py-32 bg-bg-soft border-t border-line">
        <div className="container-edge">
          <div className="max-w-4xl mx-auto text-center p-12 md:p-16 border border-line-bright bg-bg-card rounded-2xl">
            <p className="terminal-label">reserve_a_station</p>
            <h2 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight text-cream">
              Reserve before you arrive.
            </h2>
            <p className="mt-5 max-w-2xl mx-auto text-cream-dim text-lg">
              Skip the wait. Pick your branch, choose a PC tier, and lock in your session online.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              {cafeBranches[0] && (
                <Link href={`/branches/${cafeBranches[0].slug}`} className="key-cap key-cap-primary">
                  <Cpu className="h-4 w-4" />
                  Reserve a station
                </Link>
              )}
              <Link href="#locations" className="key-cap">
                See all locations
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
