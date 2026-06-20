import { accountConfig } from "./accounts";

// Fold an order's lines into per-(game, account) GROUPS for the customer status page and the staff console.
// A multi-game cart is ONE order with lines spanning several games/accounts; both UIs render it grouped.
// Pure (no I/O): callers pass the lines + a slug→{name,currency_label} map.

export interface GroupLineIn {
  vp_amount: number;
  status: string; // line fulfilment status: 'pending' | 'verified'
  position: number;
  game: string | null;
  account_id: string | null;
  account_tag: string | null;
}

export interface ViewLine {
  vp: number;
  status: string;
  position: number;
}

export interface ViewGroup {
  game: string;
  gameName: string;
  currencyLabel: string;
  accountId: string;
  accountTag: string;
  accountLabel: string; // "Name#TAG" (Riot) or the bare id (Genshin UID / MLBB User ID)
  targetVp: number;
  fulfilledVp: number;
  lines: ViewLine[];
}

export function groupLinesForView(
  lines: GroupLineIn[],
  meta: Map<string, { name: string; currency_label: string }>,
): ViewGroup[] {
  const map = new Map<string, ViewGroup>();
  for (const l of [...lines].sort((a, b) => a.position - b.position)) {
    const game = l.game ?? "";
    const accountId = l.account_id ?? "";
    const accountTag = l.account_tag ?? "";
    const key = `${game}|${accountId}|${accountTag}`;
    let g = map.get(key);
    if (!g) {
      const m = meta.get(game);
      const gameName = (m?.name as string) || (game ? game.charAt(0).toUpperCase() + game.slice(1) : "Game");
      const currencyLabel = (m?.currency_label as string) || "credits";
      const accountLabel = accountConfig(game).mode === "riot" && accountTag ? `${accountId}#${accountTag}` : accountId;
      g = { game, gameName, currencyLabel, accountId, accountTag, accountLabel, targetVp: 0, fulfilledVp: 0, lines: [] };
      map.set(key, g);
    }
    const vp = Number(l.vp_amount);
    g.lines.push({ vp, status: l.status, position: l.position });
    g.targetVp += vp;
    if (l.status === "verified") g.fulfilledVp += vp;
  }
  return [...map.values()];
}
