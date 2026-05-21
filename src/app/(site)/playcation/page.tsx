import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedBranches } from "@/lib/branches";
import HeroParallax from "@/components/site/HeroParallax";
import Reveal from "@/components/site/Reveal";
import { Bed, Calendar, Coffee, Gamepad2, Wifi } from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Playcation",
  description:
    "Comffee Playcation: short stays with PlayStation, fiber internet, and barista-grade coffee included.",
};

export default async function PlaycationPage() {
  const playBranches = await getPublishedBranches("playcation");
  const featured = playBranches[0];

  return (
    <>
      {/* ============================================================
          HERO — full-bleed photo + title text
          ============================================================ */}
      <HeroParallax src={featured?.hero_image_url} alt="Comffee Playcation" height="screen">
        <div className="max-w-4xl">
          <div className="flex items-center gap-3 mb-8 flex-wrap">
            <span className="status-chip status-chip-amber">
              <Gamepad2 className="h-3 w-3" />
              Playcation
            </span>
            {playBranches.length > 0 && (
              <span className="status-chip">
                {playBranches.length.toString().padStart(2, "0")} stays live
              </span>
            )}
          </div>
          <h1 className="font-display text-[clamp(2.75rem,8vw,6rem)] leading-[0.9] font-bold tracking-tight text-cream">
            Comffee Playcation
          </h1>
          <p className="mt-8 max-w-xl text-base md:text-lg text-cream-dim leading-relaxed">
            Short stays in private rooms with the gaming setup already wired in.
            PlayStation, fiber internet, and barista-grade coffee included.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="#stays" title="Jump to available stays" className="key-cap key-cap-primary">
              See available stays
            </Link>
            <Link href="/contact" title="Contact us for custom dates" className="key-cap">
              <Calendar className="h-4 w-4" />
              Custom dates
            </Link>
          </div>
        </div>
      </HeroParallax>

      {/* ============================================================
          WHAT'S INCLUDED
          ============================================================ */}
      <section className="relative py-24 md:py-32 bg-bg-soft border-b border-line">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="container-edge relative">
          <Reveal>
            <p className="terminal-label">included</p>
            <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream max-w-3xl">
              Everything you need. Just show up.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Gamepad2, title: "PlayStation + premium controllers", body: "Latest console, two DualSenses, big-screen TV." },
              { icon: Wifi, title: "Fiber internet", body: "Wired ethernet to the gaming corner. No lag." },
              { icon: Coffee, title: "Coffee included", body: "Espresso machine, fresh beans, full bar." },
              { icon: Bed, title: "Real bed, real shower", body: "It's still a place to sleep. Just better." },
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
          AVAILABLE STAYS — cards
          ============================================================ */}
      <section id="stays" className="container-edge py-24 md:py-32">
        <Reveal>
          <p className="terminal-label">stays</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream max-w-3xl">
            Pick your stay.
          </h2>
          <p className="mt-5 max-w-2xl text-cream-dim text-lg">
            Each Playcation has its own personality. Tap any one to walk through the rooms before you book.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {playBranches.length === 0 && (
            <p className="text-cream-dim font-mono col-span-full">
              // no playcation stays published yet — check back soon
            </p>
          )}
          {playBranches.map((b, i) => (
            <Reveal key={b.id} delay={i * 0.05}>
              <Link
                href={`/playcation/${b.slug}`}
                title={`Book ${b.name}`}
                className="group block relative overflow-hidden rounded-xl border border-line-bright bg-bg-card hover:border-amber/60 hover:-translate-y-0.5 transition-all"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {b.hero_image_url ? (
                    <img src={b.hero_image_url} alt={b.name} className="w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105" />
                  ) : (
                    <div className="absolute inset-0 bg-bg-soft bg-grid" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
                  <span className="absolute top-3 left-3 status-chip status-chip-amber">Playcation</span>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-2xl font-bold text-cream group-hover:text-amber transition-colors">{b.name}</h3>
                  {b.tagline && <p className="mt-1.5 text-sm text-cream-dim line-clamp-2">{b.tagline}</p>}
                  <p className="mt-4 font-mono text-[0.62rem] uppercase tracking-widest text-amber">View & book →</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============================================================
          FINAL CTA
          ============================================================ */}
      <section className="relative py-24 md:py-32 bg-bg-soft border-t border-line">
        <div className="container-edge">
          <div className="max-w-4xl mx-auto text-center p-12 md:p-16 border border-line-bright bg-bg-card rounded-2xl">
            <p className="terminal-label">book_a_stay</p>
            <h2 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight text-cream">
              Book in three steps.
            </h2>
            <p className="mt-5 max-w-2xl mx-auto text-cream-dim text-lg">
              Live availability synced with our Airbnb calendars. Pay via GCash, Maya, or card.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              {featured && (
                <Link href={`/playcation/${featured.slug}`} title="Start booking your stay" className="key-cap key-cap-primary">
                  Start booking
                </Link>
              )}
              <Link href="#stays" title="See all available stays" className="key-cap">See all stays</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
