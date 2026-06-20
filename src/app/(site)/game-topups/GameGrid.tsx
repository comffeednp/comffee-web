"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Gem, Search } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { gameArt } from "@/lib/game-topups/games-art";

export interface GameCardData {
  slug: string;
  name: string;
  currency: string;
  fromPrice: number | null; // cheapest customer price, for a "from ₱X" teaser
}

// Browse grid for the Game Top-Ups index. Each game links to its OWN page (/game-topups/[slug]) so the
// catalogue scales to dozens of games without one saturated page. Search filters client-side once the list
// gets long. [[game-topups]]
export default function GameGrid({ games }: { games: GameCardData[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return games;
    return games.filter((g) => g.name.toLowerCase().includes(needle) || g.slug.includes(needle));
  }, [games, q]);

  return (
    <div>
      {games.length > 8 && (
        <div className="relative mx-auto mb-6 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mocha" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a game…"
            aria-label="Search games"
            className="w-full rounded-lg border border-line-bright bg-bg py-3 pl-10 pr-4 font-mono text-sm text-cream outline-none transition focus:border-amber/70 focus-visible:ring-2 focus-visible:ring-amber"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-10 text-center font-mono text-sm text-mocha">// no games match &ldquo;{q}&rdquo;</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((g) => {
            const accent = gameArt(g.slug)?.accent ?? "#ffb547";
            return (
              <Link
                key={g.slug}
                href={`/game-topups/${g.slug}`}
                title={`Top up ${g.name}`}
                style={{ "--accent": accent } as CSSProperties}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-line-bright bg-bg-card p-5 transition hover:-translate-y-0.5"
              >
                {/* accent wash */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-60 transition group-hover:opacity-100"
                  style={{ background: `linear-gradient(150deg, ${accent}1f, transparent 60%)` }}
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: accent }}
                />
                <span
                  className="relative flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${accent}26` }}
                >
                  <Gem className="h-6 w-6" style={{ color: accent }} />
                </span>
                <p className="relative mt-3 font-display text-base font-bold leading-tight text-cream">{g.name}</p>
                <p className="relative mt-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-mocha">
                  {g.currency} · 8% off
                </p>
                <div className="relative mt-3 flex items-end justify-between">
                  <span className="font-mono text-xs text-amber">
                    {g.fromPrice != null ? `from ${formatPHP(g.fromPrice)}` : "top up"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-cream-dim transition group-hover:translate-x-0.5 group-hover:text-amber" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
