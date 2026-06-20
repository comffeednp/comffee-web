import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings, discountForGame } from "@/lib/game-topups/config";
import { computeCustomerPrice, isPriceMoveSuspicious } from "@/lib/game-topups/pricing";
import { fetchCodashopPrices } from "@/lib/game-topups/codashop";
import { sendGameTopupPriceAlert } from "@/lib/email";

export interface PriceSyncResult {
  updated: number;
  froze: number;
  readFailures: string[];
}

// Pull the live Codashop price for every active game, then for each of its active, non-frozen packages:
//   • moved WITHIN the freeze threshold → apply it + recompute the customer price.
//   • moved BEYOND the threshold → FREEZE (keep old price, stop selling) + alert the owner.
//   • VP not listed / page unreadable → leave the price UNCHANGED (alert on an unreadable page).
// The discount is re-applied every run. Shared by the daily cron and the admin "Pull now" button —
// callers handle auth (cron secret / requireFullAdmin); this function does not.
export async function runPriceSync(): Promise<PriceSyncResult> {
  const admin = getSupabaseAdmin();
  const settings = await getTopupSettings();
  const nowIso = new Date().toISOString();

  // 1) Read each active game's Codashop price map once.
  const { data: games } = await admin
    .from("game_topup_games")
    .select("slug, codashop_url, currency_label")
    .eq("active", true);
  const maps: Record<string, Record<number, number> | null> = {};
  const readFailures: string[] = [];
  for (const g of (games ?? []) as Array<{ slug: string; codashop_url: string | null; currency_label: string | null }>) {
    if (!g.codashop_url) continue; // no URL configured → manual pricing only for this game
    // Parser is generic now — pass the game's own currency label (VP / RP / Wild Cores / Genesis Crystals).
    const map = await fetchCodashopPrices(g.codashop_url, g.currency_label || "");
    maps[g.slug] = map;
    if (!map) readFailures.push(g.slug);
  }

  // 2) Apply to each active, non-frozen catalog package.
  const { data: rows } = await admin
    .from("game_topup_catalog")
    .select("id, sku, game, vp_amount, codashop_price, frozen")
    .eq("active", true);

  let updated = 0;
  const frozen: Array<{ sku: string; oldPrice: number; newPrice: number }> = [];
  for (const r of (rows ?? []) as Array<{ id: string; sku: string; game: string; vp_amount: number; codashop_price: number; frozen: boolean }>) {
    if (r.frozen) continue; // already locked, pending owner review
    const discount = discountForGame(settings, r.game);
    let codashopPrice = Number(r.codashop_price);

    const map = maps[r.game];
    const fetched = map ? map[Number(r.vp_amount)] : undefined;
    if (fetched != null) {
      if (isPriceMoveSuspicious(Number(r.codashop_price), fetched, settings.priceFreezeThresholdPct)) {
        await admin.from("game_topup_catalog").update({ frozen: true, last_synced_at: nowIso }).eq("id", r.id);
        frozen.push({ sku: r.sku, oldPrice: Number(r.codashop_price), newPrice: fetched });
        console.error(
          `[game-topup price-sync] FROZE ${r.sku}: ${r.codashop_price} -> ${fetched} (> ${settings.priceFreezeThresholdPct}% move)`,
        );
        continue;
      }
      codashopPrice = fetched; // normal move → accept the new Codashop price
    }
    // fetched undefined (VP not listed / page unreadable) → keep the old price; still re-apply the discount.

    await admin
      .from("game_topup_catalog")
      .update({
        codashop_price: codashopPrice,
        discount_pct: discount,
        customer_price: computeCustomerPrice(codashopPrice, discount),
        last_synced_at: nowIso,
      })
      .eq("id", r.id);
    updated++;
  }

  // 3) Alert the owner if anything was frozen or a Codashop page couldn't be read.
  if (frozen.length || readFailures.length) {
    await sendGameTopupPriceAlert({ frozen, readFailures }).catch((e) =>
      console.error("[game-topup price-sync] alert email failed", e instanceof Error ? e.message : e),
    );
  }

  return { updated, froze: frozen.length, readFailures };
}
