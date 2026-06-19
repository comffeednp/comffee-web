import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatusView from "./StatusView";
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
    .select("id, game, region, riot_id, riot_tag, target_vp, fulfilled_vp, amount_php, status, created_at, delivered_at")
    .eq("status_token", token)
    .maybeSingle();
  if (!order) notFound();

  const { data: lines } = await admin
    .from("game_topup_order_lines")
    .select("vp_amount, status, position")
    .eq("order_id", order.id)
    .order("position", { ascending: true });

  const initial = {
    order: {
      game: order.game as string,
      region: order.region as string,
      riotId: `${order.riot_id}#${order.riot_tag}`,
      targetVp: Number(order.target_vp),
      fulfilledVp: Number(order.fulfilled_vp),
      amountPhp: Number(order.amount_php),
      status: order.status as string,
      createdAt: order.created_at as string,
      deliveredAt: order.delivered_at as string | null,
    },
    lines: (lines ?? []).map((l) => ({ vp: Number(l.vp_amount), status: l.status as string, position: l.position as number })),
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
