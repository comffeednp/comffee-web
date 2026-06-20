import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings } from "@/lib/game-topups/config";
import GameTopupClient from "./GameTopupClient";
import { type LucideIcon, ArrowLeft, BadgePercent, Clock, CreditCard, Gamepad2, ListChecks, Mail, Send, ShieldCheck } from "lucide-react";

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
      // codashop_price is the PUBLIC Codashop retail price (also what we advertise "8% below"), used to show
      // the customer their savings. discount_pct stays hidden. Catalog still has no public-read RLS.
      .select("sku, game, region, vp_amount, label, customer_price, codashop_price")
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
    original: Number(c.codashop_price),
  }));
  const gameList = (games ?? []).map((g) => ({
    slug: g.slug as string,
    name: g.name as string,
    region: g.region_default as string,
    currency: g.currency_label as string,
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
                Top up Valorant &amp; more at <span className="font-semibold text-cream">8% off the original price</span>.
                Pay with GCash or card — our team tops up your account and emails your receipt, usually within
                minutes.
              </p>
            </div>
          </div>

          {/* trust band */}
          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            <TrustBadge icon={ShieldCheck} title="Secure payment" sub="GCash & cards · PayMongo" />
            <TrustBadge icon={Send} title="To your account" sub="Topped up by our team" />
            <TrustBadge icon={BadgePercent} title="8% off" sub="off the original price" />
            <TrustBadge icon={Clock} title="Within 24 hours" sub="Or a full refund" />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="border-b border-line bg-bg">
        <div className="container-edge py-10">
          <p className="terminal-label">// how it works</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Step n={1} icon={ListChecks} title="Pick your top-up" sub="Choose your game and amount, then enter your in-game ID." />
            <Step n={2} icon={CreditCard} title="Pay securely" sub="GCash or card, processed by PayMongo — we verify your account first." />
            <Step n={3} icon={Mail} title="Get topped up" sub="We add the credits to your account and email your receipt." />
          </div>
        </div>
      </section>

      {/* ── STORE ─────────────────────────────────────────────────────── */}
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

        <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-mocha">
          Game Top-Ups by <span className="text-cream-dim">Comffee</span> — the internet-cafe network. Payments
          are secured by PayMongo. Top-ups are fulfilled by our team and delivered to your in-game account; if we
          can&rsquo;t deliver within 24 hours, you&rsquo;re fully refunded. Philippines only. Comffee is an
          independent top-up service and is not affiliated with or endorsed by the game publishers.
        </p>
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
