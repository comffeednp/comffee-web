import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatusView from "./StatusView";
import { groupLinesForView, type GroupLineIn } from "@/lib/game-topups/grouping";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order status — Game Top-Ups",
  robots: { index: false }, // unguessable token link — keep it out of search engines
};

export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("game_topup_orders")
    .select("id, target_vp, fulfilled_vp, amount_php, status, created_at, delivered_at")
    .eq("status_token", token)
    .maybeSingle();
  if (!order) notFound();

  const { data: lines } = await admin
    .from("game_topup_order_lines")
    .select("vp_amount, status, position, game, account_id, account_tag")
    .eq("order_id", order.id)
    .order("position", { ascending: true });

  const slugs = Array.from(new Set((lines ?? []).map((l) => l.game).filter((g): g is string => !!g)));
  const { data: gameRows } = slugs.length
    ? await admin.from("game_topup_games").select("slug, name, currency_label").in("slug", slugs)
    : { data: [] as Array<{ slug: string; name: string; currency_label: string }> };
  const meta = new Map((gameRows ?? []).map((g) => [g.slug as string, g]));

  const initial = {
    order: {
      targetVp: Number(order.target_vp),
      fulfilledVp: Number(order.fulfilled_vp),
      amountPhp: Number(order.amount_php),
      status: order.status as string,
      createdAt: order.created_at as string,
      deliveredAt: order.delivered_at as string | null,
    },
    groups: groupLinesForView((lines ?? []) as GroupLineIn[], meta),
  };

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          <Link
            href="/game-topups"
            title="Back to Game Top-Ups"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            Game Top-Ups
          </Link>
          <p className="terminal-label mt-6">/game-topups/status</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-cream md:text-5xl">
            Order status
          </h1>
        </div>
      </section>
      <section className="container-edge py-12 md:py-16">
        <StatusView token={token} initial={initial} />
      </section>
    </>
  );
}
