import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings, discountForGame } from "@/lib/game-topups/config";
import { computeCustomerPrice, isPriceMoveSuspicious } from "@/lib/game-topups/pricing";

export const runtime = "nodejs";

// Daily price-sync. Recomputes each active package's customer price from its Codashop price × (1 −
// discount%), so changing the discount in admin propagates here. Already-frozen rows are left alone
// (kept at their old price). When live Codashop fetching is wired (design §19 #4 — needs the public
// price-page URLs), a >±threshold move freezes the row instead of selling at a bad price.
//
// TODO(§19): implement fetchCodashopPrice(sourceUrl) against the supplied Codashop price-page URLs.
// Until then we keep the stored codashop_price and only recompute the customer price from the discount.
async function fetchCodashopPrice(_sourceUrl: string | null): Promise<number | null> {
  return null; // not yet implemented — awaiting Codashop price-page URLs + a parser
}

async function handle(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const settings = await getTopupSettings();
  const { data: rows } = await admin
    .from("game_topup_catalog")
    .select("id, game, codashop_price, frozen, source_url")
    .eq("active", true);

  let updated = 0;
  let froze = 0;
  for (const r of (rows ?? []) as Array<{ id: string; game: string; codashop_price: number; frozen: boolean; source_url: string | null }>) {
    if (r.frozen) continue; // a frozen row keeps its old price until an admin reviews + unfreezes it

    const discount = discountForGame(settings, r.game);
    let codashopPrice = Number(r.codashop_price);

    const fetched = await fetchCodashopPrice(r.source_url);
    if (fetched != null) {
      if (isPriceMoveSuspicious(Number(r.codashop_price), fetched, settings.priceFreezeThresholdPct)) {
        await admin
          .from("game_topup_catalog")
          .update({ frozen: true, last_synced_at: new Date().toISOString() })
          .eq("id", r.id);
        froze++;
        console.error(`[game-topup price-sync] froze ${r.id}: suspicious move ${r.codashop_price} -> ${fetched}`);
        continue;
      }
      codashopPrice = fetched;
    }

    await admin
      .from("game_topup_catalog")
      .update({
        codashop_price: codashopPrice,
        discount_pct: discount,
        customer_price: computeCustomerPrice(codashopPrice, discount),
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    updated++;
  }

  return NextResponse.json({ ok: true, updated, froze });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
