import { requireEditor } from "@/lib/auth/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ConsoleClient from "./ConsoleClient";

export const dynamic = "force-dynamic";

const SCREENSHOT_BUCKET = "game-topup-screenshots";

export default async function GameTopupConsolePage() {
  await requireEditor();
  const admin = getSupabaseAdmin();

  const { data: orders } = await admin
    .from("game_topup_orders")
    .select(
      "id, game, region, riot_id, riot_tag, target_vp, fulfilled_vp, amount_php, status, screenshot_path, ocr_text, claimed_at, created_at",
    )
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true });

  const ids = (orders ?? []).map((o) => o.id);
  const { data: lines } = ids.length
    ? await admin
        .from("game_topup_order_lines")
        .select("id, order_id, vp_amount, status, position")
        .in("order_id", ids)
        .order("position", { ascending: true })
    : { data: [] as Array<{ id: string; order_id: string; vp_amount: number; status: string; position: number }> };

  // Short-lived signed URLs for the private screenshots.
  const screenshotUrls: Record<string, string> = {};
  for (const o of orders ?? []) {
    if (o.screenshot_path) {
      const { data } = await admin.storage.from(SCREENSHOT_BUCKET).createSignedUrl(o.screenshot_path, 3600);
      if (data?.signedUrl) screenshotUrls[o.id] = data.signedUrl;
    }
  }

  const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
  const { data: otps } = await admin
    .from("game_topup_otp_relay")
    .select("id, otp, sim, created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  const shaped = (orders ?? []).map((o) => ({
    id: o.id,
    game: o.game as string,
    region: o.region as string,
    riotId: o.riot_id as string,
    tag: o.riot_tag as string,
    targetVp: Number(o.target_vp),
    fulfilledVp: Number(o.fulfilled_vp),
    amountPhp: Number(o.amount_php),
    status: o.status as string,
    ocrText: (o.ocr_text as string | null) ?? null,
    claimedAt: (o.claimed_at as string | null) ?? null,
    createdAt: o.created_at as string,
    screenshotUrl: screenshotUrls[o.id] ?? null,
    lines: (lines ?? [])
      .filter((l) => l.order_id === o.id)
      .map((l) => ({ id: l.id, vp: Number(l.vp_amount), status: l.status as string, position: l.position as number })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mocha">/admin/game-topups</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-cream">Game Top-Up fulfilment</h1>
        <p className="mt-1 text-sm text-cream-dim">
          Buy each package on Codashop, then tick it here. The customer is emailed our receipt when every line is delivered.
        </p>
      </div>
      <ConsoleClient orders={shaped} otps={(otps ?? []).map((o) => ({ id: o.id as string, otp: o.otp as string, sim: (o.sim as string | null) ?? null, createdAt: o.created_at as string }))} />
    </div>
  );
}
