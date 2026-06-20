import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { groupLinesForView, type GroupLineIn } from "@/lib/game-topups/grouping";

export const runtime = "nodejs";

// Read-only order status by the unguessable status_token (the token IS the auth — no PII is returned).
// Powers the customer status page's live polling. A multi-game order is returned grouped per (game,account).
// Served via the service-role client (orders table has no public read policy). NO screenshot links here.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("game_topup_orders")
    .select("id, target_vp, fulfilled_vp, amount_php, status, created_at, delivered_at")
    .eq("status_token", token)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

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

  return NextResponse.json({
    order: {
      targetVp: Number(order.target_vp),
      fulfilledVp: Number(order.fulfilled_vp),
      amountPhp: Number(order.amount_php),
      status: order.status,
      createdAt: order.created_at,
      deliveredAt: order.delivered_at,
    },
    groups: groupLinesForView((lines ?? []) as GroupLineIn[], meta),
  });
}
