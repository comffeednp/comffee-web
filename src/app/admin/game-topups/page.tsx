import Link from "next/link";
import { Settings } from "lucide-react";
import { requireEditor } from "@/lib/auth/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { accountConfig } from "@/lib/game-topups/accounts";
import ConsoleClient from "./ConsoleClient";

export const dynamic = "force-dynamic";

const SCREENSHOT_BUCKET = "game-topup-screenshots";

export default async function GameTopupConsolePage() {
  await requireEditor();
  const admin = getSupabaseAdmin();

  const { data: orders } = await admin
    .from("game_topup_orders")
    .select("id, target_vp, fulfilled_vp, amount_php, status, ocr_text, claimed_at, created_at")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true });

  const ids = (orders ?? []).map((o) => o.id);
  type LineRow = {
    id: string;
    order_id: string;
    vp_amount: number;
    status: string;
    position: number;
    game: string | null;
    account_id: string | null;
    account_tag: string | null;
    account_verified: boolean;
    screenshot_path: string | null;
  };
  const { data: lines } = ids.length
    ? await admin
        .from("game_topup_order_lines")
        .select("id, order_id, vp_amount, status, position, game, account_id, account_tag, account_verified, screenshot_path")
        .in("order_id", ids)
        .order("position", { ascending: true })
    : { data: [] as LineRow[] };
  const allLines = (lines ?? []) as LineRow[];

  // Game display names + currency labels.
  const slugs = Array.from(new Set(allLines.map((l) => l.game).filter((g): g is string => !!g)));
  const { data: gameRows } = slugs.length
    ? await admin.from("game_topup_games").select("slug, name, currency_label").in("slug", slugs)
    : { data: [] as Array<{ slug: string; name: string; currency_label: string }> };
  const meta = new Map((gameRows ?? []).map((g) => [g.slug as string, g]));

  // Short-lived signed URLs for the private screenshots (one per distinct path).
  const distinctPaths = Array.from(new Set(allLines.map((l) => l.screenshot_path).filter((p): p is string => !!p)));
  const signed: Record<string, string> = {};
  for (const p of distinctPaths) {
    const { data } = await admin.storage.from(SCREENSHOT_BUCKET).createSignedUrl(p, 3600);
    if (data?.signedUrl) signed[p] = data.signedUrl;
  }

  const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
  const { data: otps } = await admin
    .from("game_topup_otp_relay")
    .select("id, otp, sim, created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  const shaped = (orders ?? []).map((o) => {
    const orderLines = allLines.filter((l) => l.order_id === o.id);
    // Group per (game, account).
    const groupMap = new Map<
      string,
      {
        game: string;
        gameName: string;
        currencyLabel: string;
        accountId: string;
        accountTag: string;
        accountLabel: string;
        accountVerified: boolean;
        screenshotUrl: string | null;
        lines: Array<{ id: string; vp: number; status: string }>;
      }
    >();
    for (const l of orderLines) {
      const game = l.game ?? "";
      const accountId = l.account_id ?? "";
      const accountTag = l.account_tag ?? "";
      const key = `${game}|${accountId}|${accountTag}`;
      let g = groupMap.get(key);
      if (!g) {
        const m = meta.get(game);
        const gameName = (m?.name as string) || (game ? game.charAt(0).toUpperCase() + game.slice(1) : "Game");
        const currencyLabel = (m?.currency_label as string) || "credits";
        const accountLabel =
          accountConfig(game).mode === "riot" && accountTag ? `${accountId}#${accountTag}` : accountId;
        g = {
          game,
          gameName,
          currencyLabel,
          accountId,
          accountTag,
          accountLabel,
          accountVerified: true,
          screenshotUrl: null,
          lines: [],
        };
        groupMap.set(key, g);
      }
      g.lines.push({ id: l.id, vp: Number(l.vp_amount), status: l.status });
      if (!l.account_verified) g.accountVerified = false;
      if (!g.screenshotUrl && l.screenshot_path && signed[l.screenshot_path]) g.screenshotUrl = signed[l.screenshot_path];
    }
    return {
      id: o.id,
      status: o.status as string,
      amountPhp: Number(o.amount_php),
      targetVp: Number(o.target_vp),
      fulfilledVp: Number(o.fulfilled_vp),
      ocrText: (o.ocr_text as string | null) ?? null,
      claimedAt: (o.claimed_at as string | null) ?? null,
      createdAt: o.created_at as string,
      groups: [...groupMap.values()],
    };
  });

  return (
    <section className="container-edge max-w-6xl py-12 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-mocha">/admin/game-topups</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-cream">Game Top-Up fulfilment</h1>
          <p className="mt-1 max-w-xl text-sm text-cream-dim">
            Each order is split per game &amp; account. Buy each package on Codashop, then tick it. The customer is
            emailed our receipt when every line across the order is delivered.
          </p>
        </div>
        <Link
          href="/admin/game-topups/settings"
          title="Game Top-Up prices, discount & catalog settings"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-line-bright bg-bg px-4 py-2 font-mono text-xs uppercase tracking-widest text-cream-dim transition hover:border-amber/60 hover:text-cream"
        >
          <Settings className="h-3.5 w-3.5" />
          Prices &amp; settings
        </Link>
      </div>
      <ConsoleClient
        orders={shaped}
        otps={(otps ?? []).map((o) => ({ id: o.id as string, otp: o.otp as string, sim: (o.sim as string | null) ?? null, createdAt: o.created_at as string }))}
      />
    </section>
  );
}
