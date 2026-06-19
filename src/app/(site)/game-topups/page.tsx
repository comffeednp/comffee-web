import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings } from "@/lib/game-topups/config";
import GameTopupClient from "./GameTopupClient";
import { ArrowLeft, Gamepad2 } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Game Top-Ups",
  description:
    "Buy Valorant & League points at Comffee. Pay with GCash or card from your phone — we deliver straight to your account. Philippines only.",
};

export default async function GameTopupsPage() {
  // Service-role: catalog/games have no public-read policy (it would leak our cost/margin via the anon
  // key). We select only customer-safe columns below.
  const supabase = getSupabaseAdmin();
  const [{ data: catalog }, { data: games }, settings] = await Promise.all([
    supabase
      .from("game_topup_catalog")
      .select("sku, game, region, vp_amount, label, customer_price")
      .eq("active", true)
      .eq("frozen", false)
      .order("sort_order", { ascending: true }),
    supabase
      .from("game_topup_games")
      .select("slug, name, region_default, currency_label")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    getTopupSettings(),
  ]);

  const cat = (catalog ?? []).map((c) => ({
    sku: c.sku as string,
    game: c.game as string,
    region: c.region as string,
    vp: Number(c.vp_amount),
    label: c.label as string,
    price: Number(c.customer_price),
  }));
  const gameList = (games ?? []).map((g) => ({
    slug: g.slug as string,
    name: g.name as string,
    region: g.region_default as string,
    currency: g.currency_label as string,
  }));

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          <Link
            href="/"
            title="Go to home"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            Home
          </Link>
          <div className="mt-6 flex items-start gap-3">
            <Gamepad2 className="mt-2 hidden h-6 w-6 text-amber md:block" />
            <div>
              <p className="terminal-label">/game-topups</p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-[0.95] tracking-tight text-cream md:text-6xl">
                Game top-ups, delivered.
              </h1>
              <p className="mt-3 max-w-2xl text-lg text-cream-dim">
                Buy Valorant &amp; League points from your phone. Pay with GCash or card — we deliver straight
                to your account. We check your screenshot first so it always lands on the right account.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16">
        {settings.enabled && cat.length > 0 ? (
          <GameTopupClient catalog={cat} games={gameList} />
        ) : (
          <div className="mx-auto max-w-2xl rounded-2xl border border-line-bright bg-bg-card p-10 text-center">
            <p className="font-mono text-sm text-cream-dim">
              // game top-ups are temporarily unavailable — please check back soon.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
