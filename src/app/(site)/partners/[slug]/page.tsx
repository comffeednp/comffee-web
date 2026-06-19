import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { marked } from "marked";
import { getBranchBySlug } from "@/lib/branches";
import HeroParallax from "@/components/site/HeroParallax";
import PhotoStrip from "@/components/site/PhotoStrip";
import AmenityIcon from "@/components/site/AmenityIcon";
import RateCardList from "@/components/site/RateCardList";
import RateConfigDisplay from "@/components/site/RateConfigDisplay";
import Reveal from "@/components/site/Reveal";
import GameTopupBanner from "@/components/site/GameTopupBanner";
import {
  ArrowRight,
  Clock,
  Mail,
  MapPin,
  Phone,
  Store,
} from "lucide-react";

// Public detail page for a Partner Cafe. Mirrors the /branches/[slug] layout but is a separate
// file so Comffee franchises (Lagro, SJDM) stay untouched and we don't risk regressing them by
// refactoring the central branch page mid-flight. Sections that are PARTNER-SPECIFIC (live PC
// stations, the PC reservation CTA wired to the on/off toggle, the GCash Biz Suite QR for
// customer payment) are deliberately omitted in this stage — they land in Stages 5 and 6 when
// those features are built. For now this is a clean, public-ready template that renders the
// branch's static info once the first partner cafe is approved through the POS Reservation tab
// ([[comffee-saas-vision]]).

// Render on demand (SSR) — same as the sibling /branches/[slug] and /playcation/[slug] routes.
// This is the ONLY public [slug] page that reads via the anon client alone (no cookies/headers), so
// Next would otherwise mark it SSG. An SSG dynamic route whose generateStaticParams is empty at build
// time — the normal case, since a brand-new install has no partner cafe yet — 500s on every on-demand
// render in production (works in dev, which has no SSG). Forcing dynamic keeps it consistent with the
// other branch pages and renders correctly the moment the first partner is approved through the POS.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  if (!branch || branch.type !== "partner_cafe") return { title: "Partner cafe not found" };
  return {
    title: `${branch.name} · Partner Cafe`,
    description: branch.tagline ?? undefined,
    openGraph: {
      title: branch.name,
      description: branch.tagline ?? undefined,
      images: branch.hero_image_url ? [branch.hero_image_url] : undefined,
    },
  };
}

export default async function PartnerCafeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  // Guard: this route is ONLY for partner_cafe. A franchise/Playcation slug must NOT render here
  // (it'd be a parallel public page for a Comffee branch outside its proper section). 404 cleanly.
  if (!branch || branch.type !== "partner_cafe") notFound();

  // JSON-LD for SEO — same shape the branch page uses; treats the partner cafe as a LocalBusiness.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: branch.name,
    description: branch.tagline,
    address: branch.address && {
      "@type": "PostalAddress",
      streetAddress: branch.address,
      addressLocality: branch.city,
      addressCountry: "PH",
    },
    geo: branch.lat && branch.lng && {
      "@type": "GeoCoordinates",
      latitude: branch.lat,
      longitude: branch.lng,
    },
    telephone: branch.phone,
    email: branch.email,
    image: branch.hero_image_url,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Game Top-Ups promo — the first thing on every partner-cafe page (links to the store). */}
      <GameTopupBanner />

      {/* HERO */}
      <HeroParallax src={branch.hero_image_url} alt={branch.name} height="screen">
        <div className="max-w-5xl">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="status-chip">
              <Store className="h-3 w-3" />
              Partner Cafe
            </span>
            {branch.city && (
              <span className="status-chip">
                <MapPin className="h-3 w-3" />
                {branch.city}
              </span>
            )}
            {branch.hours_text && (
              <span className="status-chip status-chip-amber">
                <Clock className="h-3 w-3" />
                {branch.hours_text}
              </span>
            )}
          </div>

          <h1 className="font-display text-[clamp(3rem,9vw,7.5rem)] leading-[0.85] font-bold tracking-tight text-cream">
            {branch.name}
          </h1>

          {branch.tagline && (
            <p className="mt-8 max-w-2xl text-lg md:text-xl text-cream-dim leading-relaxed">
              {branch.tagline}
            </p>
          )}

          {branch.photos.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-4">
              <a href="#walkthrough" title="Walk through this cafe" className="key-cap">
                Walk through
              </a>
            </div>
          )}
        </div>
      </HeroParallax>

      {/* QUICK FACTS */}
      <section className="border-y border-line bg-bg-soft">
        <div className="container-edge py-6 grid gap-4 md:grid-cols-4 text-sm">
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-amber mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">Location</p>
              <p className="mt-0.5 text-cream truncate">{branch.address ?? branch.city ?? "—"}</p>
              {(() => {
                // Public "find us" link → open Google Maps by PLACE (cafe name + address), never raw
                // lat/lng. The exact geofence coordinates are internal (staff clock-in); a customer
                // wants the named place to navigate to, not a numbers pin. (owner 2026-05-30)
                const placeQ = `${branch.name ?? ""} ${branch.address ?? ""} ${branch.city ?? ""}`.trim();
                const href = placeQ
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQ)}`
                  : branch.lat && branch.lng
                    ? `https://www.google.com/maps/search/?api=1&query=${branch.lat},${branch.lng}`
                    : null;
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    title="Open this cafe's location in Google Maps"
                    className="font-mono text-[0.65rem] text-amber hover:underline"
                  >
                    Open in Google Maps →
                  </a>
                ) : null;
              })()}
            </div>
          </div>
          <FactItem icon={Clock} label="Hours" value={branch.hours_text ?? "—"} />
          <FactItem icon={Phone} label="Phone" value={branch.phone ?? "—"} />
          <FactItem icon={Mail} label="Email" value={branch.email ?? "—"} />
        </div>
      </section>

      {/* STORY */}
      {branch.description_md && (
        <section className="container-edge py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <Reveal>
              <p className="terminal-label">about_this_cafe</p>
              <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream">
                The story.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <div
                className="prose-comffe"
                dangerouslySetInnerHTML={{ __html: marked(branch.description_md) }}
              />
            </Reveal>
          </div>
        </section>
      )}

      {/* WALKTHROUGH */}
      {branch.photos.length > 0 && (
        <section
          id="walkthrough"
          className="relative py-24 md:py-32 bg-bg-soft border-y border-line"
        >
          <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
          <div className="container-edge relative">
            <div className="max-w-3xl">
              <Reveal>
                <p className="terminal-label">walkthrough.exec</p>
                <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream">
                  Take a walk inside.
                </h2>
                <p className="mt-5 text-cream-dim text-lg">
                  Drag the strip or use the arrows. This is exactly what you&apos;ll see when you arrive.
                </p>
              </Reveal>
            </div>
          </div>
          <div className="mt-12 relative">
            <PhotoStrip photos={branch.photos} />
          </div>
        </section>
      )}

      {/* AMENITIES */}
      {branch.amenities.length > 0 && (
        <section className="container-edge py-24 md:py-32">
          <Reveal>
            <p className="terminal-label">amenities.list</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream max-w-2xl">
              What&apos;s on the spec sheet.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branch.amenities.map((amenity, i) => (
              <Reveal key={amenity.id} delay={i * 0.04}>
                <div className="group relative h-full p-6 border border-line-bright bg-bg-card rounded-xl hover:border-amber/50 transition">
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber/40 bg-bg text-amber">
                      <AmenityIcon name={amenity.icon} className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-cream">{amenity.label}</h3>
                      {amenity.description && (
                        <p className="mt-1 text-sm text-cream-dim leading-relaxed">
                          {amenity.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* RATES */}
      {(() => {
        const hasRateConfig =
          branch.rate_config != null && (branch.rate_config.categories?.length ?? 0) > 0;
        if (!hasRateConfig && branch.rates.length === 0) return null;
        return (
          <section className="relative py-24 md:py-32 border-y border-line bg-bg-soft">
            <div className="container-edge">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <Reveal>
                  <p className="terminal-label">rates.live</p>
                  <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream max-w-2xl">
                    The numbers.
                  </h2>
                </Reveal>
                <span className="font-mono text-xs text-mocha uppercase tracking-widest">
                  // prices in PHP
                </span>
              </div>
              {hasRateConfig ? (
                <RateConfigDisplay config={branch.rate_config!} />
              ) : (
                <RateCardList rates={branch.rates} />
              )}
            </div>
          </section>
        );
      })()}

      {/* FINAL CTA — generic for Stage 2 (no booking flow wired yet). Stages 5-6 add the PC
          reservation CTA (gated by the on/off toggle) and the GCash QR display. For now we point
          customers to walk in or contact the cafe directly. */}
      <section className="container-edge py-24 md:py-32">
        <div className="relative max-w-4xl mx-auto text-center p-12 md:p-16 border border-amber/30 bg-bg-card rounded-2xl bg-grid-dense">
          <p className="terminal-label">drop_by</p>
          <h2 className="mt-4 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream">
            See you at <span className="text-amber text-glow-amber">{branch.name}</span>?
          </h2>
          <p className="mt-5 text-cream-dim text-lg max-w-xl mx-auto">
            Walk-ins welcome. Message the cafe directly to ask about availability.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/partners" title="See all partner cafes" className="key-cap">
              See other partner cafes
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function FactItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-amber mt-1 shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
          {label}
        </p>
        <p className="mt-0.5 text-cream truncate">{value}</p>
      </div>
    </div>
  );
}
