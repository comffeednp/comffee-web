import { getPublishedBranches } from "@/lib/branches";
import HeroParallax from "@/components/site/HeroParallax";
import Reveal from "@/components/site/Reveal";
import PartnerFinder from "@/components/site/PartnerFinder";
import type { Metadata } from "next";
import { Store } from "lucide-react";

// Public listing of independent internet cafes that bought the Comffee POS as SaaS and got
// approved. Distinct from /branches (Comffee-brand franchises + Playcation) — see
// [[comffee-saas-vision]]. Currently empty until the first partner is approved through the POS
// "Reservation" tab. Listing is filtered by branch_type='partner_cafe' (added in migration 0032).
//
// Cache: 60s — partners go live the moment the owner approves a submission, so we don't want a
// stale empty state long after the first one is approved. Branches listing uses 300s, but partner
// onboarding is a "new feature is visible" moment we want to feel snappy.

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Partner Cafes",
  description:
    "Independent internet cafes running on the Comffee POS — book a PC, pay via the cafe's GCash, walk in ready.",
};

export default async function PartnerCafesPage() {
  const partners = await getPublishedBranches("partner_cafe");
  const heroSrc = partners[0]?.hero_image_url ?? null;

  return (
    <>
      <HeroParallax src={heroSrc} alt="Partner Cafes" height="medium">
        <div className="max-w-4xl">
          <p className="terminal-label">/partners</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tight text-cream max-w-4xl">
            Partner Cafes.
          </h1>
          <p className="mt-8 max-w-2xl text-lg md:text-xl text-cream-dim leading-relaxed">
            Independent internet cafes running on the Comffee POS. Reserve a PC online, pay through
            the cafe&apos;s own GCash, walk in ready.
          </p>
        </div>
      </HeroParallax>

      <section className="container-edge py-16 md:py-24">
        {partners.length === 0 ? (
          // No partners approved yet — clean empty state. Once the first partner submits through
          // the POS Reservation tab and the owner approves it, this page populates automatically
          // (revalidate=60 → fresh within a minute).
          <Reveal>
            <div className="mx-auto max-w-2xl text-center border border-line-bright bg-bg-card rounded-2xl p-12 md:p-16">
              <Store className="h-10 w-10 text-amber mx-auto" />
              <h2 className="mt-6 font-display text-3xl md:text-4xl font-bold text-cream">
                No partner cafes yet.
              </h2>
              <p className="mt-4 text-cream-dim leading-relaxed">
                Run an internet cafe? Comffee POS gets you a live page right here — with online PC
                reservations paid through your own GCash Business QR. Reach out and we&apos;ll get
                you set up.
              </p>
            </div>
          </Reveal>
        ) : (
          <Reveal>
            {/* Search (near-me / by-name) + multi-branch grouping live in this client island. */}
            <PartnerFinder partners={partners} />
          </Reveal>
        )}
      </section>
    </>
  );
}
