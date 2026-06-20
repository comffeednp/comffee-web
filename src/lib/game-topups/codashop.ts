// Daily Codashop price reader for the auto price-sync — works for every game (Valorant, League, Wild Rift,
// Genshin, …), not just VP.
//
// The page renders each purchasable tile as the denomination ("N <currency>") repeated 2-3× consecutively
// followed by its "₱N" price. We CO-LOCATE: walk the page in document order, and pair a price with the
// denomination only when that exact amount was just repeated ≥2× immediately before it (a real product
// card). This deliberately skips the page's summary "quick lists" (all amounts, then all prices) and the
// pass / first-time-bonus rows (an amount with no price right after), which is what made a naive sorted-
// pairing wrong for those games.
//
// CONFIDENCE GATE (keeps it safe for pricing): parseCodashopPrices returns null on anything unexpected
// (no data, <2 tiers, an implausible ₱-per-unit, or a non-monotonic result). The price-sync treats null as
// "don't change anything + alert", and the per-SKU ±threshold freeze in the cron is the second safety
// layer, so a Codashop markup change can never silently mis-price a sale.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Plausible ₱ per currency-unit. Wide enough to span every game (VP ~0.4, RP ~0.35, Wild Cores ~0.45,
// Genesis Crystals ~0.7-0.9) yet still rejects a misaligned pairing or a doubled/garbage value.
const MIN_PER_UNIT = 0.1;
const MAX_PER_UNIT = 1.6;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pure: extract a { amount: phpPrice } map from a Codashop page for the given currency label (e.g. "VP",
 *  "RP", "Wild Cores", "Genesis Crystals"), or null if not confident. See the file header for the method. */
export function parseCodashopPrices(html: string, currencyLabel: string): Record<number, number> | null {
  if (!html || !currencyLabel) return null;

  // Tokenise the page into amount + price tokens, in document order.
  const amountRe = new RegExp("([0-9][0-9,]*)\\s*" + escapeRe(currencyLabel) + "\\b", "gi");
  const priceRe = /(?:₱|&#8369;|PHP)\s*([0-9][0-9,]*)/gi;
  type Tok = { pos: number; kind: "amt" | "price"; value: number };
  const toks: Tok[] = [];
  for (const m of html.matchAll(amountRe)) toks.push({ pos: m.index ?? 0, kind: "amt", value: parseInt(m[1].replace(/,/g, ""), 10) });
  for (const m of html.matchAll(priceRe)) toks.push({ pos: m.index ?? 0, kind: "price", value: parseInt(m[1].replace(/,/g, ""), 10) });
  toks.sort((a, b) => a.pos - b.pos);

  // Co-locate: a price belongs to the amount that was just repeated ≥2× right before it (a product card).
  // First occurrence of each amount wins, so a trailing "from ₱…" / duplicate block can't overwrite it.
  const map: Record<number, number> = {};
  let runValue = 0;
  let runCount = 0;
  for (const t of toks) {
    if (t.kind === "amt") {
      if (t.value === runValue) runCount++;
      else { runValue = t.value; runCount = 1; }
    } else {
      if (runCount >= 2 && runValue > 0 && map[runValue] === undefined) {
        const perUnit = t.value / runValue;
        if (perUnit >= MIN_PER_UNIT && perUnit <= MAX_PER_UNIT) map[runValue] = t.value;
      }
      runValue = 0;
      runCount = 0; // a price ends the current card
    }
  }

  const amounts = Object.keys(map).map(Number).sort((a, b) => a - b);
  if (amounts.length < 2) return null; // not confident
  // Monotonic guard: a bigger pack must never cost less — catches a stray mis-pair.
  for (let i = 1; i < amounts.length; i++) {
    if (map[amounts[i]] < map[amounts[i - 1]]) return null;
  }
  return map;
}

/** Fetch the Codashop page and parse it for the given currency label. Returns null on any failure
 *  (network, non-2xx, low confidence) so the caller leaves prices unchanged and alerts. */
export async function fetchCodashopPrices(url: string, currencyLabel: string): Promise<Record<number, number> | null> {
  if (!url || !currencyLabel) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return parseCodashopPrices(await res.text(), currencyLabel);
  } catch {
    return null;
  }
}

/** Lightweight "is Codashop up" check used at PAYMENT time — we must not take money if Codashop is down,
 *  because we can't buy the points. Returns true ONLY on a 2xx within a short timeout; any non-2xx /
 *  network error / timeout → false (fail-CLOSED for payments). The pay route gates on this. */
export async function isCodashopReachable(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(9_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
