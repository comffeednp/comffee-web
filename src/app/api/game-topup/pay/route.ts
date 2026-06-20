import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { guardMutating } from "@/lib/security";
import { createCheckoutSession, bookingPaymentMethods } from "@/lib/paymongo";
import { getTopupSettings } from "@/lib/game-topups/config";
import { isCodashopReachable } from "@/lib/game-topups/codashop";
import { isPhAllowed } from "@/lib/game-topups/geo";
import { claimVerifiedProof } from "@/lib/game-topups/verify-attempts";

export const runtime = "nodejs";

// Create the ONE PayMongo checkout for a multi-(game,account) cart. The client sends the cart as GROUPS,
// each already screenshot-verified (a verifyId from /api/game-topup/ocr). The server, in order:
//   1. re-prices every sku from the catalog (active+!frozen, sku belongs to the group's game) — never client prices;
//   2. gates: every distinct game must be active AND its Codashop reachable (don't take money we can't fulfil);
//   3. ATOMICALLY CLAIMS each verifyId (single-use: a reload / 2nd tab can't mint a 2nd paid order);
//   4. builds ONE order envelope + N lines, each carrying its own game/account/screenshot (0063);
//   5. creates ONE PayMongo checkout for the summed amount.
// Gates run BEFORE the claim so a transient Codashop outage doesn't burn the customer's verifications. The
// order is 'draft' until the checkout exists (a failed checkout → SLA draft purge). The webhook flips
// verified→pending on the signed payment.

function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  return u && u.startsWith("https://") ? u : "https://comffee.org";
}

const groupSchema = z.object({
  game: z.string().min(1).max(64),
  accountId: z.string().min(3).max(64),
  accountTag: z.string().min(1).max(64),
  verifyId: z.string().uuid(),
  skus: z.array(z.string().min(1).max(64)).min(1).max(20),
});
const schema = z.object({
  groups: z.array(groupSchema).min(1).max(10),
  email: z.string().email(),
  consent: z.literal(true),
});

export async function POST(request: Request) {
  if (!isPhAllowed(request)) return NextResponse.json({ error: "ph_only" }, { status: 403 });

  const guarded = await guardMutating(request, {
    bucket: "game-topup-pay",
    limit: 10,
    windowMs: 10 * 60 * 1000,
    maxBytes: 16 * 1024,
  });
  if ("error" in guarded) return guarded.error;
  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  const { groups, email } = parsed.data;

  const settings = await getTopupSettings();
  if (!settings.enabled) return NextResponse.json({ error: "disabled" }, { status: 503 });

  const admin = getSupabaseAdmin();

  // 1) Re-price every sku from the catalog (source of truth). Build a per-group priced plan.
  const allSkus = Array.from(new Set(groups.flatMap((g) => g.skus)));
  const { data: cat } = await admin
    .from("game_topup_catalog")
    .select("sku, game, region, vp_amount, codashop_price, customer_price, active, frozen")
    .in("sku", allSkus);
  const bySku = new Map((cat ?? []).map((c) => [c.sku as string, c]));

  type Priced = { sku: string; vp_amount: number; codashop_price: number; customer_price: number; game: string; region: string };
  const plan: Array<{ group: (typeof groups)[number]; items: Priced[] }> = [];
  let amount = 0;
  let targetVp = 0;
  for (const g of groups) {
    const items: Priced[] = [];
    for (const sku of g.skus) {
      const c = bySku.get(sku);
      if (!c || !c.active || c.frozen || (c.game as string) !== g.game) {
        return NextResponse.json({ error: "package_unavailable", sku }, { status: 409 });
      }
      items.push({
        sku: c.sku as string,
        vp_amount: Number(c.vp_amount),
        codashop_price: Number(c.codashop_price),
        customer_price: Number(c.customer_price),
        game: g.game,
        region: c.region as string,
      });
      amount += Number(c.customer_price);
      targetVp += Number(c.vp_amount);
    }
    plan.push({ group: g, items });
  }
  if (!(amount > 0)) return NextResponse.json({ error: "invalid_amount" }, { status: 409 });

  // 2) Gates per distinct game: must be ACTIVE (server-side kill switch) and its Codashop reachable.
  const distinctGames = Array.from(new Set(groups.map((g) => g.game)));
  const { data: gameRows } = await admin
    .from("game_topup_games")
    .select("slug, name, codashop_url, active")
    .in("slug", distinctGames);
  const gameMeta = new Map((gameRows ?? []).map((r) => [r.slug as string, r]));
  for (const slug of distinctGames) {
    const m = gameMeta.get(slug) as { active?: boolean } | undefined;
    if (!m || !m.active) return NextResponse.json({ error: "package_unavailable", sku: slug }, { status: 409 });
  }
  if (settings.requireCodashopUp) {
    const urls = Array.from(
      new Set(
        distinctGames.map(
          (slug) =>
            (gameMeta.get(slug) as { codashop_url?: string | null } | undefined)?.codashop_url ||
            "https://www.codashop.com/en-ph/",
        ),
      ),
    );
    for (const url of urls) {
      if (!(await isCodashopReachable(url))) {
        return NextResponse.json({ error: "fulfilment_unavailable" }, { status: 503 });
      }
    }
  }

  // 3) ATOMICALLY claim each group's verification (single-use). Done AFTER the gates so a transient
  //    Codashop/active failure never consumes the customer's proofs.
  const proofByGroup = new Map<string, { screenshotPath: string | null; needsReview: boolean }>();
  let anyReview = false;
  for (const g of groups) {
    const proof = await claimVerifiedProof(admin, g.verifyId, g.game, g.accountId, g.accountTag);
    if (!proof) return NextResponse.json({ error: "verify_expired" }, { status: 409 });
    if (proof.needsReview) anyReview = true;
    proofByGroup.set(g.verifyId, proof);
  }

  // 4) Build the line rows now that proofs are claimed.
  type LineInsert = Priced & {
    account_id: string;
    account_tag: string;
    account_verified: boolean;
    screenshot_path: string | null;
    position: number;
  };
  const lineRows: LineInsert[] = [];
  let position = 0;
  for (const { group, items } of plan) {
    const proof = proofByGroup.get(group.verifyId)!;
    for (const it of items) {
      lineRows.push({
        ...it,
        account_id: group.accountId,
        account_tag: group.accountTag,
        account_verified: true,
        screenshot_path: proof.screenshotPath,
        position: position++,
      });
    }
  }

  // 5) Create the order envelope (draft until the checkout exists) + its lines.
  const firstGame = groups[0].game;
  const firstRegion = lineRows[0]?.region ?? "AP";
  const { data: created, error: insErr } = await admin
    .from("game_topup_orders")
    .insert({
      game: firstGame, // legacy envelope field; source of truth is per-line
      region: firstRegion,
      riot_id: null,
      riot_tag: null,
      target_vp: targetVp,
      amount_php: amount,
      customer_email: email,
      consent_at: new Date().toISOString(),
      verified: true,
      ocr_text: anyReview ? "[vision-unavailable: manual review]" : null,
      status: "draft",
    })
    .select("id, status_token")
    .single();
  if (insErr || !created) {
    console.error("[game-topup] order create failed", insErr?.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  const orderId = created.id as string;
  const statusToken = created.status_token as string;

  const { error: lineErr } = await admin
    .from("game_topup_order_lines")
    .insert(lineRows.map((l) => ({ order_id: orderId, ...l })));
  if (lineErr) {
    await admin.from("game_topup_orders").delete().eq("id", orderId);
    console.error("[game-topup] line insert failed", lineErr.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // 6) One PayMongo checkout for the whole cart. Summarize the games (no single-VP figure across games).
  const gameNames = distinctGames.map((s) => (gameMeta.get(s)?.name as string) || s);
  const itemCount = lineRows.length;
  const summary =
    gameNames.length === 1
      ? `${gameNames[0]} top-up`
      : `${gameNames.slice(0, 3).join(", ")}${gameNames.length > 3 ? " +more" : ""} top-up`;
  try {
    const checkout = await createCheckoutSession({
      amountPhp: amount,
      description: `Comffee Game Top-Up · ${summary} · ${itemCount} item${itemCount === 1 ? "" : "s"}`,
      lineItemName: `Comffee Game Top-Up — ${itemCount} item${itemCount === 1 ? "" : "s"}`,
      paymentMethodTypes: bookingPaymentMethods(amount),
      successUrl: `${siteUrl()}/game-topups/status/${statusToken}`,
      cancelUrl: `${siteUrl()}/game-topups`,
      remarks: `game_topup:${orderId}`,
      // no secretKey → PLATFORM env key (Comffee's PayMongo account)
    });
    await admin
      .from("game_topup_orders")
      .update({
        status: "verified",
        paymongo_checkout_id: checkout.id,
        paymongo_payment_intent_id: checkout.payment_intent_id,
      })
      .eq("id", orderId);
    return NextResponse.json({ ok: true, checkoutUrl: checkout.checkout_url, statusToken });
  } catch (e) {
    console.error("[game-topup] checkout failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
