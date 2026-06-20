import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeName } from "./ocr";
import { accountConfig } from "./accounts";
import { sendGameTopupReceipt } from "@/lib/email";

// Confirmation matcher — the fulfilment core. Applies ONE Codashop delivery confirmation (inbound receipt
// email or SMS fallback) to a specific order LINE: dedupe on reference, find an OPEN line of EXACTLY this
// (game, account, VP) that is still pending, tick it, record an append-only event, recompute the order's
// fulfilled total, and (when EVERY line across all groups is verified) mark the order delivered + send our
// branded, per-(game,account)-grouped receipt. Service-role only. Idempotent; never short-completes.

export interface ConfirmationInput {
  game: string | null; // resolved best-effort from the confirmation; disambiguates same-VP across games
  riotId: string | null; // the account identity (Riot name / Genshin UID / MLBB User ID)
  tag: string | null;
  vp: number | null;
  ref: string | null;
  source: "codashop_email" | "sms" | "manual";
  rawText?: string | null;
}

export interface ConfirmationResult {
  ok: boolean;
  matched: boolean;
  delivered?: boolean;
  orderId?: string;
  lineId?: string;
  reason?: string;
}

export async function applyConfirmation(input: ConfirmationInput): Promise<ConfirmationResult> {
  const admin = getSupabaseAdmin();
  const vp = input.vp;
  if (!vp || vp <= 0) return { ok: false, matched: false, reason: "no_vp" };

  // The account identity is REQUIRED to auto-tick: a delivery must bind to the proven account, so a
  // confirmation we can't tie to one never auto-fulfils — staff resolve it from the console.
  const target = input.riotId ? normalizeName(input.riotId) : null;
  if (!target || target.length < 3) return { ok: true, matched: false, reason: "no_account_needs_review" };

  // Idempotency key. Prefer the Codashop reference; else synthesize a DETERMINISTIC key from
  // source + game + account + VP + raw text so a byte-identical replay dedupes while two genuinely-distinct
  // deliveries don't. Includes game+account so the same VP to different games/accounts never false-dedupes.
  const ref =
    input.ref?.trim() ||
    "auto-" +
      crypto
        .createHash("sha256")
        .update(`${input.source}|${input.game ?? ""}|${target}|${vp}|${(input.rawText || "").trim()}`)
        .digest("hex")
        .slice(0, 40);

  // Early dedupe (the unique index on fulfillment_events.ref is the hard gate; this is the fast path).
  {
    const { data: dup } = await admin
      .from("game_topup_fulfillment_events")
      .select("id")
      .eq("ref", ref)
      .maybeSingle();
    if (dup) return { ok: true, matched: false, reason: "duplicate_ref" };
  }

  // Candidate OPEN lines: a pending, screenshot-verified line of exactly this VP (+ this game when known),
  // whose order is still open. Then filter to the exact normalized account.
  let q = admin
    .from("game_topup_order_lines")
    .select("id, order_id, account_id, game, position, game_topup_orders!inner(status, ocr_text)")
    .eq("vp_amount", vp)
    .eq("status", "pending")
    .eq("account_verified", true)
    .in("game_topup_orders.status", ["processing", "pending"]);
  if (input.game) q = q.eq("game", input.game);
  const { data: candLines } = await q;

  type Cand = {
    id: string;
    order_id: string;
    account_id: string | null;
    game: string | null;
    position: number;
    game_topup_orders: { status: string; ocr_text: string | null } | { status: string; ocr_text: string | null }[];
  };
  const orderOf = (c: Cand) => (Array.isArray(c.game_topup_orders) ? c.game_topup_orders[0] : c.game_topup_orders);
  const cands = ((candLines ?? []) as Cand[]).filter(
    (l) =>
      l.account_id &&
      normalizeName(l.account_id) === target &&
      // Fail-open (Vision-down) orders are flagged for manual review — never auto-tick them; staff deliver
      // them by hand after eyeballing the (unverified) screenshot.
      !(orderOf(l)?.ocr_text || "").includes("manual review"),
  );

  // Cross-game safety: if the confirmation's game couldn't be parsed (input.game null) and the candidates
  // span more than one game, refuse to auto-tick — a "1000" confirmation must not tick the wrong game's line.
  if (new Set(cands.map((c) => c.game)).size > 1) {
    return { ok: true, matched: false, reason: "ambiguous_needs_review" };
  }

  // Group candidate lines by ORDER. >1 distinct open order matching this (game,account,VP) → ambiguous,
  // never auto-tick (a human resolves it). Within the single matching order, tick the lowest-position line
  // (handles a legit cart with two identical lines for the same account — each confirmation ticks one).
  const byOrder = new Map<string, Cand[]>();
  for (const l of cands) {
    const arr = byOrder.get(l.order_id);
    if (arr) arr.push(l);
    else byOrder.set(l.order_id, [l]);
  }
  const orderIds = [...byOrder.keys()];
  if (orderIds.length === 0) return { ok: true, matched: false, reason: "no_match" };
  if (orderIds.length > 1) return { ok: true, matched: false, reason: "ambiguous_needs_review" };

  const onlyOrderId = orderIds[0];
  const chosenLine = byOrder.get(onlyOrderId)!.sort((a, b) => a.position - b.position)[0];
  const chosen = { orderId: onlyOrderId, lineId: chosenLine.id };

  // Record the event FIRST: the unique `ref` insert is the atomic idempotency claim — only the winner of a
  // same-ref race proceeds to tick the line, so a duplicate confirmation can never fulfil two lines.
  const { error: evErr } = await admin.from("game_topup_fulfillment_events").insert({
    order_id: chosen.orderId,
    line_id: chosen.lineId,
    vp_added: vp,
    source: input.source,
    raw_text: input.rawText ?? null,
    ref,
  });
  if (evErr) {
    if ((evErr as { code?: string }).code === "23505") return { ok: true, matched: false, reason: "duplicate_ref" };
    return { ok: false, matched: false, reason: "event_insert_failed" };
  }

  // Tick the line (guard status='pending' → idempotent if something already verified it).
  const { data: ticked } = await admin
    .from("game_topup_order_lines")
    .update({ status: "verified", matched_ref: ref, verified_at: new Date().toISOString() })
    .eq("id", chosen.lineId)
    .eq("status", "pending")
    .select("id");
  if (!ticked || ticked.length === 0) return { ok: true, matched: false, reason: "line_already_verified" };

  const delivered = await recomputeAndMaybeDeliver(chosen.orderId);
  return { ok: true, matched: true, orderId: chosen.orderId, lineId: chosen.lineId, delivered };
}

/** Manually tick ONE specific line as delivered (staff console fallback when auto-confirm missed it).
 *  Guarded + idempotent; records a 'manual' audit event and delivers the order if it completes it. */
export async function markLineDeliveredManual(lineId: string): Promise<{ ok: boolean; delivered: boolean; reason?: string }> {
  const admin = getSupabaseAdmin();
  const { data: line } = await admin
    .from("game_topup_order_lines")
    .select("id, order_id, vp_amount, status")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { ok: false, delivered: false, reason: "not_found" };
  if (line.status === "verified") return { ok: true, delivered: false, reason: "already_verified" };

  const ref = `manual-${lineId}`;
  await admin
    .from("game_topup_fulfillment_events")
    .insert({ order_id: line.order_id, line_id: lineId, vp_added: line.vp_amount, source: "manual", raw_text: "manual delivery (staff console)", ref })
    .then(() => {}, () => {}); // dedupe-safe: a repeat manual tick just no-ops on the unique ref

  const { data: ticked } = await admin
    .from("game_topup_order_lines")
    .update({ status: "verified", matched_ref: ref, verified_at: new Date().toISOString() })
    .eq("id", lineId)
    .eq("status", "pending")
    .select("id");
  if (!ticked || ticked.length === 0) return { ok: true, delivered: false, reason: "already_verified" };

  const delivered = await recomputeAndMaybeDeliver(line.order_id as string);
  return { ok: true, delivered };
}

/** Recompute fulfilled_vp; if every line is verified, flip the order to delivered (guarded against a
 *  concurrent duplicate) and fire the per-(game,account)-grouped branded receipt. */
async function recomputeAndMaybeDeliver(orderId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: lines } = await admin
    .from("game_topup_order_lines")
    .select("vp_amount, status, customer_price, position, game, account_id, account_tag")
    .eq("order_id", orderId)
    .order("position", { ascending: true });
  type LineRow = {
    vp_amount: number;
    status: string;
    customer_price: number;
    game: string | null;
    account_id: string | null;
    account_tag: string | null;
  };
  const all = (lines ?? []) as LineRow[];
  const fulfilled = all.filter((l) => l.status === "verified").reduce((s, l) => s + Number(l.vp_amount), 0);
  const everyVerified = all.length > 0 && all.every((l) => l.status === "verified");

  await admin.from("game_topup_orders").update({ fulfilled_vp: fulfilled }).eq("id", orderId);
  if (!everyVerified) return false;

  // All lines verified → DELIVER. Guard on the open statuses so a duplicate event can't re-deliver / re-send.
  const { data: deliveredRows } = await admin
    .from("game_topup_orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", orderId)
    .in("status", ["processing", "pending"])
    .select("id, customer_email, amount_php, status_token");
  const row = deliveredRows && deliveredRows[0];
  if (!row) return false; // already delivered by a concurrent confirmation

  if (row.customer_email) {
    // Game display names + currency labels for the receipt headers.
    const slugs = Array.from(new Set(all.map((l) => l.game).filter((g): g is string => !!g)));
    const { data: gameRows } = slugs.length
      ? await admin.from("game_topup_games").select("slug, name, currency_label").in("slug", slugs)
      : { data: [] as Array<{ slug: string; name: string; currency_label: string }> };
    const meta = new Map((gameRows ?? []).map((g) => [g.slug as string, g]));

    // Group the order's lines by (game, account) for the receipt.
    const groupMap = new Map<
      string,
      { game: string; accountId: string; accountTag: string; lines: Array<{ vp: number; pricePhp: number }>; subtotalVp: number }
    >();
    for (const l of all) {
      const game = l.game ?? "";
      const accountId = l.account_id ?? "";
      const accountTag = l.account_tag ?? "";
      const key = `${game}|${accountId}|${accountTag}`;
      const g = groupMap.get(key) ?? { game, accountId, accountTag, lines: [], subtotalVp: 0 };
      g.lines.push({ vp: Number(l.vp_amount), pricePhp: Number(l.customer_price) });
      g.subtotalVp += Number(l.vp_amount);
      groupMap.set(key, g);
    }
    const groups = [...groupMap.values()].map((g) => {
      const m = meta.get(g.game);
      const gameName = (m?.name as string) || (g.game ? g.game.charAt(0).toUpperCase() + g.game.slice(1) : "Game");
      const currencyLabel = (m?.currency_label as string) || "credits";
      const accountLabel = accountConfig(g.game).mode === "riot" && g.accountTag ? `${g.accountId}#${g.accountTag}` : g.accountId;
      return { gameName, currencyLabel, accountLabel, lines: g.lines, subtotalVp: g.subtotalVp };
    });

    sendGameTopupReceipt({
      to: row.customer_email,
      orderId: row.id,
      amountPhp: Number(row.amount_php),
      statusToken: row.status_token,
      groups,
    }).catch((e) => console.error("[game-topup] receipt email failed", e instanceof Error ? e.message : e));
  }
  return true;
}
