import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeName } from "./ocr";
import { sendGameTopupReceipt } from "@/lib/email";

// Confirmation matcher — the fulfilment core. Applies ONE Codashop delivery confirmation (from the
// inbound receipt email or the SMS fallback) to an order: dedupe on reference, find an OPEN order whose
// Riot ID matches and that has an unverified line of EXACTLY this VP, tick that one line, record an
// append-only event, recompute the fulfilled total, and (when every line is verified) mark the order
// delivered + send our branded receipt. Service-role only. Idempotent; never short-completes.

export interface ConfirmationInput {
  riotId: string | null;
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

  // Riot ID is REQUIRED to auto-tick: the whole point is to bind a delivery to the proven account, so a
  // confirmation we can't tie to a Riot ID never auto-fulfils — staff resolve it from the console.
  const target = input.riotId ? normalizeName(input.riotId) : null;
  if (!target || target.length < 3) return { ok: true, matched: false, reason: "no_riot_id_needs_review" };

  // Idempotency key. Prefer the Codashop reference; when a confirmation carries none (common on the SMS
  // fallback, or an email whose wording didn't parse), synthesize a DETERMINISTIC key from source + Riot
  // ID + VP + raw text — so a byte-identical replay dedupes, while two genuinely-distinct deliveries
  // (different raw text) don't. Without this, Postgres treats NULL refs as DISTINCT and a replayed no-ref
  // confirmation would tick a SECOND line (free VP).
  const ref =
    input.ref?.trim() ||
    "auto-" +
      crypto
        .createHash("sha256")
        .update(`${input.source}|${target}|${vp}|${(input.rawText || "").trim()}`)
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

  // Candidate OPEN orders whose Riot ID matches EXACTLY (normalized) — avoids near-name collisions like
  // "Luna" vs "Lunatic". Oldest first; prefer 'processing' (a staffer is actively buying it) over 'pending'.
  const { data: openOrders } = await admin
    .from("game_topup_orders")
    .select("id, riot_id, status, created_at")
    .in("status", ["processing", "pending"])
    .order("created_at", { ascending: true });
  const candidates = ((openOrders ?? []) as Array<{ id: string; riot_id: string; status: string }>)
    .filter((o) => normalizeName(o.riot_id) === target)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "processing" ? -1 : 1));

  // Among candidates, collect those with an unverified line of exactly this VP (lowest position first).
  const matches: Array<{ orderId: string; lineId: string }> = [];
  for (const o of candidates) {
    const { data: line } = await admin
      .from("game_topup_order_lines")
      .select("id")
      .eq("order_id", o.id)
      .eq("vp_amount", vp)
      .eq("status", "pending")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (line) matches.push({ orderId: o.id, lineId: (line as { id: string }).id });
  }

  if (matches.length === 0) return { ok: true, matched: false, reason: "no_match" };
  // More than one open order matches this Riot ID + VP → ambiguous; never auto-tick (a human resolves it).
  if (matches.length > 1) return { ok: true, matched: false, reason: "ambiguous_needs_review" };

  const chosen = matches[0];

  // Record the event FIRST: the unique `ref` insert is the atomic idempotency claim — only the winner of
  // a same-ref race proceeds to tick the line, so a duplicate confirmation can never fulfil two lines.
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
 *  concurrent duplicate) and fire the branded receipt. Returns whether THIS call delivered it. */
async function recomputeAndMaybeDeliver(orderId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: lines } = await admin
    .from("game_topup_order_lines")
    .select("vp_amount, status, customer_price, position")
    .eq("order_id", orderId)
    .order("position", { ascending: true });
  const all = (lines ?? []) as Array<{ vp_amount: number; status: string; customer_price: number }>;
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
    .select("id, game, riot_id, riot_tag, customer_email, amount_php, target_vp, status_token");
  const row = deliveredRows && deliveredRows[0];
  if (!row) return false; // already delivered by a concurrent confirmation

  if (row.customer_email) {
    sendGameTopupReceipt({
      to: row.customer_email,
      orderId: row.id,
      game: row.game,
      riotId: `${row.riot_id}#${row.riot_tag}`,
      totalVp: Number(row.target_vp),
      amountPhp: Number(row.amount_php),
      statusToken: row.status_token,
      lines: all.map((l) => ({ vp: Number(l.vp_amount), pricePhp: Number(l.customer_price) })),
    }).catch((e) => console.error("[game-topup] receipt email failed", e instanceof Error ? e.message : e));
  }
  return true;
}
