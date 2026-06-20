import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings } from "@/lib/game-topups/config";
import GameGrid, { type GameCardData } from "./GameGrid";
import { type LucideIcon, ArrowLeft, BadgePercent, Clock, CreditCard, Gamepad2, ListChecks, Mail, Send, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Game Top-Ups",
  description:
    "Buy game credits at Comffee — Valorant, League, Mobile Legends, Genshin & more. Pay with GCash or card from your phone; we deliver straight to your account at 8% off. Philippines only.",
};

export default async function GameTopupsPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: games }, { data: catalog }, settings] = await Promise.all([
    supabase
      .from("game_topup_games")
      .select("slug, name, region_default, currency_label, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    // Cheapest active price per game → a "from ₱X" teaser on each card. Service-role + customer-safe cols only.
    supabase.from("game_topup_catalog").select("game, customer_price").eq("active", true).eq("frozen", false),
    getTopupSettings(),
  ]);

  const fromByGame = new Map<string, number>();
  for (const c of catalog ?? []) {
    const g = c.game as string;
    const p = Number(c.customer_price);
    if (!Number.isFinite(p) || p <= 0) continue;
    const cur = fromByGame.get(g);
    if (cur == null || p < cur) fromByGame.set(g, p);
  }
  // Only list games that actually have something to sell.
  const cards: GameCardData[] = (games ?? [])
    .filter((g) => fromByGame.has(g.slug as string))
    .map((g) => ({
      slug: g.slug as string,
      name: g.name as string,
      currency: g.currency_label as string,
      fromPrice: fromByGame.get(g.slug as string) ?? null,
    }));

  return (
    <>
      {/* ── HERO ──────────────────────────────────────────────────────── */}
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
                Game credits, delivered to your account.
              </h1>
              <p className="mt-3 max-w-2xl text-lg text-cream-dim">
                Pick your game below. Pay with GCash or card at{" "}
                <span className="font-semibold text-cream">8% off the original price</span> — our team tops up your
                account and emails your receipt, usually within minutes.
              </p>
            </div>
          </div>

          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            <TrustBadge icon={ShieldCheck} title="Secure payment" sub="GCash & cards · PayMongo" />
            <TrustBadge icon={Send} title="To your account" sub="Topped up by our team" />
            <TrustBadge icon={BadgePercent} title="8% off" sub="off the original price" />
            <TrustBadge icon={Clock} title="Within 24 hours" sub="Or a full refund" />
          </div>
        </div>
      </section>

      {/* ── GAME GRID ─────────────────────────────────────────────────── */}
      <section className="container-edge py-12 md:py-16">
        <p className="terminal-label">// choose your game</p>
        <div className="mt-5">
          {settings.enabled && cards.length > 0 ? (
            <GameGrid games={cards} />
          ) : (
            <div className="mx-auto max-w-2xl rounded-2xl border border-line-bright bg-bg-card p-10 text-center">
              <p className="font-mono text-sm text-cream-dim">
                // game top-ups are temporarily unavailable — please check back soon.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="border-t border-line bg-bg">
        <div className="container-edge py-10">
          <p className="terminal-label">// how it works</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Step n={1} icon={ListChecks} title="Pick your game & amount" sub="Open a game, enter your in-game ID, and choose how much to top up." />
            <Step n={2} icon={CreditCard} title="Pay securely" sub="GCash or card, processed by PayMongo — we verify your account first." />
            <Step n={3} icon={Mail} title="Get topped up" sub="We add the credits to your account and email your receipt." />
          </div>

          <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-mocha">
            Game Top-Ups by <span className="text-cream-dim">Comffee</span> — the internet-cafe network. Payments
            are secured by PayMongo. Top-ups are fulfilled by our team and delivered to your in-game account; if we
            can&rsquo;t deliver within 24 hours, you&rsquo;re fully refunded. Philippines only. Comffee is an
            independent top-up service and is not affiliated with or endorsed by the game publishers.
          </p>
        </div>
      </section>
    </>
  );
}

function TrustBadge({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line-bright bg-bg-card p-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight text-cream">{title}</p>
        <p className="mt-0.5 font-mono text-[0.65rem] text-mocha">{sub}</p>
      </div>
    </div>
  );
}

function Step({ n, icon: Icon, title, sub }: { n: number; icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber/15 font-mono text-sm font-bold text-amber">
          {n}
        </span>
        <Icon className="h-5 w-5 text-cream-dim" />
      </div>
      <p className="mt-3 font-display font-semibold text-cream">{title}</p>
      <p className="mt-1 text-sm text-cream-dim">{sub}</p>
    </div>
  );
}
