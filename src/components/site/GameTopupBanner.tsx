import Link from "next/link";

// Promo strip shown at the TOP of every partner-cafe page (/partners/[slug]) — the "first thing they
// see" placement from the Game Top-Ups spec. Real, responsive text (good for SEO + screen readers) with
// a small neon motif. The standalone baked-caption graphic for non-web use (POS / Clockwork first-launch
// banner, marketing) is /public/game-topups-banner.svg. The whole strip is one link (carries the title).
export default function GameTopupBanner() {
  return (
    <Link
      href="/game-topups"
      title="Get discounted game credits — Valorant & League top-ups"
      className="group relative block overflow-hidden border-b border-amber/30 bg-gradient-to-r from-bg-soft via-bg-card to-bg transition-colors hover:border-amber/60"
    >
      {/* neon glows */}
      <span aria-hidden className="pointer-events-none absolute -top-16 right-10 h-48 w-48 rounded-full bg-phosphor/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 right-48 h-40 w-40 rounded-full bg-rgb-b/20 blur-3xl" />

      <div className="container-edge relative flex items-center justify-between gap-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {/* angular shard motif */}
          <svg aria-hidden viewBox="0 0 48 48" className="hidden h-9 w-9 shrink-0 sm:block">
            <polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="#ffb547" strokeWidth="2.5" />
            <polygon points="24,14 34,24 24,34 14,24" fill="#ffb547" opacity="0.25" />
          </svg>
          <p className="truncate text-sm font-semibold text-cream sm:text-base">
            <span className="text-amber">Get discounted game credits here!</span>
            <span className="hidden font-normal text-cream-dim md:inline">
              {" "}
              — Valorant &amp; League points, delivered to your account.
            </span>
          </p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber px-3 py-1.5 text-xs font-bold text-bg transition-transform group-hover:scale-[1.03]">
          Top up now
          <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
