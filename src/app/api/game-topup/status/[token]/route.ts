import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Read-only order status by the unguessable status_token (the token IS the auth — no PII is returned).
// Powers the customer status page's live progress polling. Served via the service-role client because
// the orders table has no public read policy.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("game_topup_orders")
    .select("id, game, region, riot_id, riot_tag, target_vp, fulfilled_vp, amount_php, status, created_at, delivered_at")
    .eq("status_token", token)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: lines } = await admin
    .from("game_topup_order_lines")
    .select("vp_amount, status, position")
    .eq("order_id", order.id)
    .order("position", { ascending: true });

  return NextResponse.json({
    order: {
      game: order.game,
      region: order.region,
      riotId: `${order.riot_id}#${order.riot_tag}`,
      targetVp: Number(order.target_vp),
      fulfilledVp: Number(order.fulfilled_vp),
      amountPhp: Number(order.amount_php),
      status: order.status,
      createdAt: order.created_at,
      deliveredAt: order.delivered_at,
    },
    lines: (lines ?? []).map((l) => ({ vp: Number(l.vp_amount), status: l.status, position: l.position })),
  });
}
