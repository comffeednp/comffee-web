// Per-game visual identity for the Game Top-Ups store + promo banner. FRONT-END ONLY (no DB column) —
// keyed by `game_topup_games.slug`. Drives two things:
//   1. the per-game KEY ART hero + accent theming on /game-topups (only the DB-active game shows there);
//   2. the multi-game chips on the <GameTopupBanner/> promo strip (shows live + coming-soon as a teaser).
// To launch a "soon" game: seed/activate its DB row (game + catalog) — the art here lights up by slug.
// Art files live in /public/games/<slug>-hero.svg. [[game-topups]]

export type GameStatus = "live" | "soon";

export interface GameArt {
  slug: string;
  name: string;
  /** Short label for the promo chip (full names like "League of Legends" get trimmed). */
  chip: string;
  /** Display unit — mirrors game_topup_games.currency_label, for the banner teaser. */
  currency: string;
  /** Signature hex. Themes the store (scopes --color-amber) and tints the chip dot. */
  accent: string;
  /** Key-art hero shown on the store for this game. */
  art: string;
  /** "live" = sellable now; "soon" = art ready, DB row not yet activated. */
  status: GameStatus;
}

// Order = teaser priority: live first, then by PH popularity.
export const GAME_ART: GameArt[] = [
  { slug: "valorant",          name: "Valorant",          chip: "Valorant",       currency: "VP",               accent: "#FF4655", art: "/games/valorant-hero.svg",          status: "live" },
  { slug: "mobile-legends",    name: "Mobile Legends",    chip: "Mobile Legends", currency: "Diamonds",         accent: "#FFC107", art: "/games/mobile-legends-hero.svg",    status: "soon" },
  { slug: "league-of-legends", name: "League of Legends", chip: "League",         currency: "RP",               accent: "#C8AA6E", art: "/games/league-of-legends-hero.svg", status: "soon" },
  { slug: "wild-rift",         name: "Wild Rift",         chip: "Wild Rift",      currency: "Wild Cores",       accent: "#0AC8B9", art: "/games/wild-rift-hero.svg",         status: "soon" },
  { slug: "genshin-impact",    name: "Genshin Impact",    chip: "Genshin",        currency: "Genesis Crystals", accent: "#9D7BE0", art: "/games/genshin-impact-hero.svg",    status: "soon" },
];

/** Decorative espresso backdrop for the promo strip (live text overlays the left). */
export const PROMO_BG = "/games/topups-promo-bg.svg";

export function gameArt(slug: string): GameArt | undefined {
  return GAME_ART.find((g) => g.slug === slug);
}
