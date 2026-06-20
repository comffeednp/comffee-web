import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings } from "@/lib/game-topups/config";
import GameTopupClient from "../GameTopupClient";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

function prettify(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  const name = prettify(game);
  return {
    title: `${name} Top-Up`,
    description: `Buy ${name} credits at Comffee — pay with GCash or card, delivered to your account at 8% off. Philippines only.`,
  };
}

export default async function GameTopupGamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game: slug } = await params;
  const supabase = getSupabaseAdmin();

  const [{ data: gameRow }, { data: catalog }, settings] = await Promise.all([
    supabase
      .from("game_topup_games")
      .select("slug, name, region_default, currency_label")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("game_topup_catalog")
      .select("sku, game, region, vp_amount, label, customer_price, codashop_price")
      .eq("game", slug)
      .eq("active", true)
      .eq("frozen", false)
      .order("sort_order", { ascending: true }),
    getTopupSettings(),
  ]);

  // 404 for an unknown / inactive game (also covers junk like /game-topups/status hitting this route).
  if (!gameRow) notFound();

  const cat = (catalog ?? []).map((c) => ({
    sku: c.sku as string,
    game: c.game as string,
    region: c.region as string,
    vp: Number(c.vp_amount),
    label: c.label as string,
    price: Number(c.customer_price),
    original: Number(c.codashop_price),
  }));
  const gameInfo = [
    {
      slug: gameRow.slug as string,
      name: gameRow.name as string,
      region: gameRow.region_default as string,
      currency: gameRow.currency_label as string,
    },
  ];

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          <Link
            href="/game-topups"
            title="Back to all games"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            All games
          </Link>
          <p className="terminal-label mt-6">/game-topups/{gameRow.slug as string}</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-cream md:text-5xl">
            {gameRow.name as string} top-up
          </h1>
          <p className="mt-2 max-w-2xl text-cream-dim">
            <span className="font-semibold text-cream">8% off the original price</span> · delivered to your account ·
            paid by GCash or card.
          </p>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16">
        {settings.enabled && cat.length > 0 ? (
          <GameTopupClient catalog={cat} games={gameInfo} />
        ) : (
          <div className="mx-auto max-w-2xl rounded-2xl border border-line-bright bg-bg-card p-10 text-center">
            <p className="font-mono text-sm text-cream-dim">
              // {gameRow.name as string} top-ups are temporarily unavailable — please check back soon.
            </p>
          </div>
        )}

        <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-mocha">
          Payments are secured by PayMongo. Top-ups are fulfilled by our team and delivered to your in-game account;
          if we can&rsquo;t deliver within 24 hours, you&rsquo;re fully refunded. Philippines only. Comffee is an
          independent top-up service and is not affiliated with or endorsed by the game publishers.
        </p>
      </section>
    </>
  );
}
