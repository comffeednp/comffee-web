import Link from "next/link";
import { GAME_ART, PROMO_BG } from "@/lib/game-topups/games-art";

// Full-width promo strip shown at the TOP of every branch + partner-cafe page — the "first thing they
// see". The WHOLE strip is one <Link> to the store (so it carries the title, per AGENTS.md). It teases
// every game we carry (live + coming-soon chips) over the espresso art backdrop /public/games/topups-
// promo-bg.svg, with live, responsive text (good for SEO + screen readers). The standalone baked-caption
// graphic for non-web use (POS / Clockwork first-launch, marketing) is /public/game-topups-banner.svg.
// [[game-topups]]
export default function GameTopupBanner() {
  return (
    <Link
      href="/game-topups"
      title="Get discounted game credits — Valorant, Mobile Legends, League & more top-ups"
      className="group relative block overflow-hidden border-b border-amber/30 bg-bg transition-colors hover:border-amber/60"
    >
      {/* espresso art backdrop (decorative) */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-90"
        style={{ backgroundImage: `url(${PROMO_BG})` }}
      />
      {/* left legibility veil so the headline always reads */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-transparent" />

      <div className="container-edge relative flex items-center justify-between gap-4 py-3.5">
        <div className="min-w-0">
          <p className="terminal-label">// game top-ups</p>
          <p className="mt-1 truncate text-base font-bold sm:text-lg">
            <span className="text-amber">Get discounted game credits here!</span>
          </p>

          {/* game chips — every game we carry (live + coming-soon) */}
          <div className="mt-2 hidden flex-wrap items-center gap-1.5 md:flex">
            {GAME_ART.map((g) => (
              <span
                key={g.slug}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-bright bg-bg-card/70 px-2.5 py-1 font-mono text-[0.68rem] text-cream-dim"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: g.accent, boxShadow: `0 0 6px ${g.accent}` }}
                />
                {g.chip}
                {g.status === "soon" && (
                  <span className="ml-0.5 text-[0.58rem] uppercase tracking-wider text-mocha">soon</span>
                )}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-cream-dim md:hidden">Valorant now · more games soon</p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber px-3.5 py-2 text-xs font-bold text-bg transition-transform group-hover:scale-[1.04] sm:text-sm">
          Top up now
          <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
