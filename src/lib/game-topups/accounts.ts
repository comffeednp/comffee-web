// Per-game account-identity config for Game Top-Ups. The verify route is generic — it matches the
// player's `accountId` as a substring/fuzzy in the screenshot and stores a secondary `tag` for the
// fulfiller — so each game maps its in-game identity to {accountId, tag} here, and the storefront renders
// the right field(s) + proof copy. This is the single source of truth for "what does this game's account
// look like", reused by the per-line account capture in the multi-game cart. [[game-topups]]

export interface AccountIdentity {
  /** Matched against the screenshot (Riot name / Genshin UID / MLBB User ID). */
  accountId: string;
  /** Secondary identity stored for the fulfiller (Riot #tag / Genshin server / MLBB Zone). */
  tag: string;
}

export interface GameAccountConfig {
  /** "riot" = ONE combined "Name#TAG" field (split on the first #). "pair" = two separate fields. */
  mode: "riot" | "pair";
  /** Label for the id field (the single combined field in riot mode). */
  idLabel: string;
  idPlaceholder: string;
  /** "tel" → numeric keypad + numeric inputMode (for digit-only IDs). */
  idKind: "text" | "tel";
  idHint: string;
  /** pair mode only — the secondary field. */
  tagLabel?: string;
  tagPlaceholder?: string;
  tagKind?: "text" | "tel";
  /** If set, the tag is a dropdown (e.g. Genshin server) instead of a free-text field. */
  tagOptions?: string[];
  /** What the screenshot must clearly show (drives the proof copy). */
  proofWhat: string;
  /** Show the bundled Riot-style profile sample image (only meaningful for Riot games). */
  showSample: boolean;
}

const RIOT: GameAccountConfig = {
  mode: "riot",
  idLabel: "your account ID — include your #tag",
  idPlaceholder: "Westbourne#SEA",
  idKind: "text",
  idHint: "Type it exactly as in-game, including the # and your tag — e.g. Westbourne#SEA.",
  proofWhat: "your name and #tag",
  showSample: true,
};

// Keyed by game_topup_games.slug. Unknown slugs fall back to Riot (the original behaviour).
const CONFIGS: Record<string, GameAccountConfig> = {
  valorant: RIOT,
  "league-of-legends": RIOT,
  "wild-rift": RIOT,
  "genshin-impact": {
    mode: "pair",
    idLabel: "UID — your 9-digit player ID",
    idPlaceholder: "8XXXXXXXX",
    idKind: "tel",
    idHint: "Open the in-game Paimon menu — your UID is the 9-digit number at the bottom-right of the screen.",
    tagLabel: "server",
    tagOptions: ["America", "Europe", "Asia", "TW, HK, MO"],
    proofWhat: "your 9-digit UID",
    showSample: false,
  },
  "mobile-legends": {
    mode: "pair",
    idLabel: "User ID",
    idPlaceholder: "123456789",
    idKind: "tel",
    idHint: "Tap your profile (top-left). Your User ID and Zone show under your name — e.g. 123456789 (1234).",
    tagLabel: "Zone / Server ID",
    tagPlaceholder: "1234",
    tagKind: "tel",
    proofWhat: "your User ID and Zone",
    showSample: false,
  },
};

export function accountConfig(slug: string): GameAccountConfig {
  return CONFIGS[slug] ?? RIOT;
}

/** Split a combined Riot ID ("Name#TAG"). Riot names can't contain '#', so split at the first one.
 *  Returns null until BOTH a name (>=3 chars) and a tag are present. */
function splitRiot(full: string): AccountIdentity | null {
  const s = (full || "").trim();
  const i = s.indexOf("#");
  if (i < 1) return null;
  const name = s.slice(0, i).trim();
  const tag = s.slice(i + 1).trim().replace(/^#+/, "");
  if (name.length < 3 || tag.length < 1) return null;
  return { accountId: name, tag };
}

/** Build + validate the account identity from the raw field values for a game. Returns null until valid.
 *  The accountId must be >=3 chars (too short to prove ownership) and the tag must be present. */
export function buildIdentity(
  slug: string,
  raw: { combined?: string; id?: string; tag?: string },
): AccountIdentity | null {
  const cfg = accountConfig(slug);
  if (cfg.mode === "riot") return splitRiot(raw.combined ?? "");
  const id = (raw.id ?? "").trim();
  const tag = (raw.tag ?? "").trim();
  if (id.length < 3 || !tag) return null;
  return { accountId: id, tag };
}

/** Human-readable identity for display ("Name#TAG" for Riot, the id alone for pair games). */
export function formatIdentity(slug: string, idy: AccountIdentity): string {
  return accountConfig(slug).mode === "riot" ? `${idy.accountId}#${idy.tag}` : idy.accountId;
}
