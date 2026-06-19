import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings, discountForGame } from "@/lib/game-topups/config";
import { computeCustomerPrice, isPriceMoveSuspicious } from "@/lib/game-topups/pricing";
import { fetchCodashopVpPrices } from "@/lib/game-topups/codashop";
import { sendGameTopupPriceAlert } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Codashop price-sync. For each active game with a Codashop URL, read the live VP→₱ map ONCE, then
// for each of that game's active catalog packages:
//   • Codashop price moved WITHIN the freeze threshold → apply it + recompute the customer price.
//   • moved BEYOND the threshold → FREEZE the package (keep the old price, stop selling it) + alert the
//     owner. This is the guard against ever auto-selling a suddenly-changed / overpriced rate.
//   • VP not listed, or the page couldn't be read confidently → leave the price UNCHANGED (and alert on
//     an unreadable page). A Codashop markup change can never silently mis-price a sale.
// The discount is re-applied every run, so an admin discount change propagates even when Codashop hasn't moved.

async function handle(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const settings = await getTopupSettings();
  const nowIso = new Date().toISOString();

  // 1) Read each active game's Codashop price map once.
  const { data: games } = await admin
    .from("game_topup_games")
    .select("slug, codashop_url")
    .eq("active", true);
  const maps: Record<string, Record<number, number> | null> = {};
  const readFailures: string[] = [];
  for (const g of (games ?? []) as Array<{ slug: string; codashop_url: string | null }>) {
    if (!g.codashop_url) continue; // no URL configured → manual pricing only for this game
    const map = await fetchCodashopVpPrices(g.codashop_url);
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

  return NextResponse.json({ ok: true, updated, froze: frozen.length, readFailures });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
