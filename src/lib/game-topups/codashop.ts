// Daily Codashop price reader for the auto price-sync.
//
// The rendered Valorant page lists every denomination's VP and its ₱ price, but they are NOT co-located
// in the DOM and the internal JSON pairs prices to payment channels (with service fees) — so there's no
// single clean field to read. Instead we read the two authoritative customer-facing lists: all "N VP"
// labels and all "₱N" amounts, then pair them by SORTED ORDER. That is valid because VP denominations
// are strictly monotonic (more points → higher price).
//
// A CONFIDENCE GATE makes this safe for pricing: parseCodashopVpPrices returns null on anything
// unexpected (no data, unequal counts, an implausible price-per-VP). The price-sync treats null as
// "don't change anything + alert the owner", so a Codashop markup change can never silently mis-price a
// sale. The per-SKU ±threshold freeze in the cron is the second safety layer.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Plausible ₱ per VP. Today's denominations sit at ~0.36–0.42 (₱199/475 … ₱3999/11000). The band is
// wide enough to absorb real price changes but rejects a misaligned pairing or a doubled/garbage value.
const MIN_PER_VP = 0.2;
const MAX_PER_VP = 0.7;

function uniqSortedInts(values: number[]): number[] {
  return [...new Set(values.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
}

/** Pure: extract a { vpAmount: phpPrice } map from the Codashop page HTML, or null if not confident. */
export function parseCodashopVpPrices(html: string): Record<number, number> | null {
  if (!html) return null;
  const vps = uniqSortedInts(
    [...html.matchAll(/([0-9][0-9,]*)\s*VP\b/gi)].map((m) => parseInt(m[1].replace(/,/g, ""), 10)),
  );
  const prices = uniqSortedInts(
    [...html.matchAll(/(?:₱|&#8369;|PHP)\s*([0-9][0-9,]*)/gi)].map((m) => parseInt(m[1].replace(/,/g, ""), 10)),
  );
  // Confidence gate: need at least two of each and the SAME count to pair by sorted order.
  if (vps.length < 2 || prices.length < 2 || vps.length !== prices.length) return null;

  const map: Record<number, number> = {};
  for (let i = 0; i < vps.length; i++) {
    const vp = vps[i];
    const price = prices[i];
    const perVp = price / vp;
    if (perVp < MIN_PER_VP || perVp > MAX_PER_VP) return null; // implausible → reject the whole read
    map[vp] = price;
  }
  return map;
}

/** Fetch the Codashop page and parse it. Returns null on any failure (network, non-2xx, low confidence)
 *  so the caller leaves prices unchanged and alerts. */
export async function fetchCodashopVpPrices(url: string): Promise<Record<number, number> | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return parseCodashopVpPrices(await res.text());
  } catch {
    return null;
  }
}
