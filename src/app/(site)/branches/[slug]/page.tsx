import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllBranchSlugs, getBranchBySlug } from "@/lib/branches";
import { getPCStationsForBranch } from "@/lib/pc-stations";
import HeroParallax from "@/components/site/HeroParallax";
import PhotoStrip from "@/components/site/PhotoStrip";
import AmenityIcon from "@/components/site/AmenityIcon";
import RateCardList from "@/components/site/RateCardList";
import LivePCStations from "@/components/site/LivePCStations";
import Reveal from "@/components/site/Reveal";
import {
  ArrowRight,
  Clock,
  Mail,
  MapPin,
  Phone,
  Power,
  Cpu,
  Gamepad2,
} from "lucide-react";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await getAllBranchSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  if (!branch) return { title: "Branch not found" };
  return {
    title: branch.name,
    description: branch.tagline ?? undefined,
    openGraph: {
      title: branch.name,
      description: branch.tagline ?? undefined,
      images: branch.hero_image_url ? [branch.hero_image_url] : undefined,
    },
  };
}

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  if (!branch) notFound();

  const isPlay = branch.type === "playcation";
  // Cafes get a live-PC reservation CTA; playcations get a Playcation booking CTA
  const ctaHref = isPlay
    ? `/playcation/${branch.slug}/book`
    : `/branches/${branch.slug}/reserve-pc`;
  const ctaLabel = isPlay ? "Reserve your stay" : "Reserve a PC";
  const TypeIcon = isPlay ? Gamepad2 : Cpu;

  // Live PC station data (only meaningful for cafe branches integrated with PanCafe)
  const pcSnapshot = isPlay
    ? null
    : await getPCStationsForBranch(branch.id);

  // JSON-LD for SEO
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

      {/* ============================================================
          HERO
          ============================================================ */}
      <HeroParallax src={branch.hero_image_url} alt={branch.name} height="screen">
        <div className="max-w-5xl">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className={`status-chip ${isPlay ? "status-chip-amber" : ""}`}>
              <TypeIcon className="h-3 w-3" />
              {isPlay ? "Playcation Stay" : "Internet Cafe"}
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

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href={ctaHref} className="key-cap key-cap-primary">
              <Power className="h-4 w-4" />
              {ctaLabel}
            </Link>
            <a href="#walkthrough" className="key-cap">
              Walk through
            </a>
          </div>
        </div>
      </HeroParallax>

      {/* ============================================================
          QUICK FACTS BAR
          ============================================================ */}
      <section className="border-y border-line bg-bg-soft">
        <div className="container-edge py-6 grid gap-4 md:grid-cols-4 text-sm">
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-amber mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">Location</p>
              <p className="mt-0.5 text-cream truncate">{branch.address ?? branch.city ?? "—"}</p>
              {(branch.lat && branch.lng) ? (
                <a
                  href={`https://www.google.com/maps?q=${branch.lat},${branch.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[0.65rem] text-amber hover:underline"
                >
                  Open in Google Maps →
                </a>
              ) : (branch.address || branch.city) ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.address ?? ""} ${branch.city ?? ""}`.trim())}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[0.65rem] text-amber hover:underline"
                >
                  Open in Google Maps →
                </a>
              ) : null}
            </div>
          </div>
          <FactItem icon={Clock} label="Hours" value={branch.hours_text ?? "—"} />
          <FactItem icon={Phone} label="Phone" value={branch.phone ?? "—"} />
          <FactItem icon={Mail} label="Email" value={branch.email ?? "—"} />
        </div>
      </section>

      {/* ============================================================
          STORY
          ============================================================ */}
      {branch.description_md && (
        <section className="container-edge py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <Reveal>
              <p className="terminal-label">about_this_place</p>
              <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream">
                The story.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="prose-comffe text-cream-dim text-lg leading-relaxed whitespace-pre-line">
                {branch.description_md}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ============================================================
          WALK THROUGH — the showpiece
          ============================================================ */}
      {branch.photos.length > 0 && (
        <section
          id="walkthrough"
          className="relative py-24 md:py-32 bg-bg-soft border-y border-line overflow-hidden"
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
                  Drag the screen below or use the arrows. This is exactly what you&apos;ll see when you arrive.
                </p>
              </Reveal>
            </div>
            <div className="mt-12">
              <PhotoStrip photos={branch.photos} />
            </div>
          </div>
        </section>
      )}

      {/* ============================================================
          LIVE PC STATIONS — only renders if pc_stations rows exist
          ============================================================ */}
      {pcSnapshot && pcSnapshot.stations.length > 0 && (
        <LivePCStations
          branchId={branch.id}
          branchSlug={branch.slug}
          initialStations={pcSnapshot.stations}
          initialSyncedAt={pcSnapshot.lastSyncedAt}
        />
      )}

      {/* ============================================================
          AMENITIES
          ============================================================ */}
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

      {/* ============================================================
          RATES
          ============================================================ */}
      {branch.rates.length > 0 && (
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
            <RateCardList rates={branch.rates} />
          </div>
        </section>
      )}

      {/* ============================================================
          FINAL CTA
          ============================================================ */}
      <section className="container-edge py-24 md:py-32">
        <div className="relative max-w-4xl mx-auto text-center p-12 md:p-16 border border-amber/30 bg-bg-card rounded-2xl bg-grid-dense">
          <p className="terminal-label">ready</p>
          <h2 className="mt-4 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream">
            See you at <span className="text-amber text-glow-amber">{branch.name}</span>?
          </h2>
          <p className="mt-5 text-cream-dim text-lg max-w-xl mx-auto">
            {isPlay
              ? "Pick your dates. We'll have the controllers charged and the computers ready."
              : "Walk-ins welcome. Or message us if you want to reserve a private station."}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href={ctaHref} className="key-cap key-cap-primary">
              <Power className="h-4 w-4" />
              {ctaLabel}
            </Link>
            <Link href="/branches" className="key-cap">
              See other branches
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
