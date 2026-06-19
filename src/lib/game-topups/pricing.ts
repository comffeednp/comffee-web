// Pure pricing helpers for Game Top-Ups. No I/O — unit-tested in pricing.test.ts.

/** Our customer price = Codashop price × (1 − discount%), rounded to whole pesos (display uses 0 dp).
 *  Discount is clamped to [0, 90] to defend against a bad admin / sync value. */
export function computeCustomerPrice(codashopPrice: number, discountPct: number): number {
  if (!Number.isFinite(codashopPrice) || codashopPrice <= 0) return 0;
  const pct = Number.isFinite(discountPct) ? Math.min(Math.max(discountPct, 0), 90) : 0;
  return Math.max(0, Math.round(codashopPrice * (1 - pct / 100)));
}

/** Greedy, largest-first split of a target VP into available package sizes. Returns the package list
 *  that sums EXACTLY to target, or null if no exact combination exists. Only powers optional "quick-pick"
 *  preset totals — the storefront otherwise lets the customer assemble package lines directly (so a
 *  combo like 2525 = 2050 + 475 is just two chosen packages). */
export function splitTargetIntoPackages(targetVp: number, available: number[]): number[] | null {
  if (!Number.isFinite(targetVp) || targetVp <= 0) return null;
  const sizes = [...new Set(available)].filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => b - a);
  const out: number[] = [];
  let remaining = targetVp;
  for (const v of sizes) {
    while (remaining >= v) {
      out.push(v);
      remaining -= v;
    }
  }
  return remaining === 0 ? out : null;
}

/** Price-sync safety: is the new Codashop price a suspicious move vs the old one (> threshold %)?
 *  A non-positive / non-finite new price is always suspicious (freeze + keep the old price). */
export function isPriceMoveSuspicious(oldPrice: number, newPrice: number, thresholdPct: number): boolean {
  if (!Number.isFinite(newPrice) || newPrice <= 0) return true;
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return false; // no baseline to compare against
  const movePct = (Math.abs(newPrice - oldPrice) / oldPrice) * 100;
  return movePct > thresholdPct;
}
