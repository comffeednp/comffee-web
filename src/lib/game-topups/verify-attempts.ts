import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "./ocr";

// Per-identity screenshot-verification ladder + verified-account record, backing the multi-account cart.
// One row per (game, normalized accountId, tag) in game_topup_verify_attempts. It is BOTH:
//   • the 3-try anti-abuse lockout (tries / block_level / blocked_until) — keyed to the IDENTITY, not an
//     order, so a bot can't dodge a lockout by minting fresh state; and
//   • the short-lived "this account's screenshot was verified" record that /pay consumes at checkout (the
//     row id is the opaque verifyId the storefront holds per cart group).
// All access is via the service-role client (the table has no RLS policies → locked to service-role).

export const VERIFY_TTL_MS = 2 * 60 * 60 * 1000; // a verified account stays usable at checkout for 2h
const LOCK_AFTER_TRIES = 3;

export interface VerifyAttemptRow {
  id: string;
  game: string;
  account_norm: string;
  tag: string;
  tries: number;
  block_level: number;
  blocked_until: string | null;
  last_screenshot_path: string | null;
  needs_review: boolean;
  verified_at: string | null;
}

const COLS = "id, game, account_norm, tag, tries, block_level, blocked_until, last_screenshot_path, needs_review, verified_at";

/** Canonical identity key. tag is trimmed (kept raw — server/zone/#tag are exact-match), accountId is
 *  normalized the same way the OCR matcher normalizes (uppercase, alnum-only) so writes and reads agree. */
export function identityKey(game: string, accountId: string, tag: string | null | undefined) {
  return { game, account_norm: normalizeName(accountId), tag: (tag ?? "").trim() };
}

/** Stable, filesystem-safe screenshot folder for an identity (no order exists at verify time). */
export function identityHash(game: string, accountNorm: string, tag: string): string {
  return crypto.createHash("sha256").update(`${game}|${accountNorm}|${tag}`).digest("hex").slice(0, 16);
}

export function isLocked(row: Pick<VerifyAttemptRow, "blocked_until"> | null): boolean {
  return !!row?.blocked_until && new Date(row.blocked_until) > new Date();
}

export async function loadAttempt(
  admin: SupabaseClient,
  game: string,
  accountId: string,
  tag: string | null | undefined,
): Promise<VerifyAttemptRow | null> {
  const k = identityKey(game, accountId, tag);
  const { data } = await admin
    .from("game_topup_verify_attempts")
    .select(COLS)
    .eq("game", k.game)
    .eq("account_norm", k.account_norm)
    .eq("tag", k.tag)
    .maybeSingle();
  return (data as VerifyAttemptRow | null) ?? null;
}

/** Atomically CONSUME a verifyId at checkout: it must be fresh (within TTL), match the (game,account,tag)
 *  identity, and not already consumed. Clears verified_at in the SAME statement so the proof is SINGLE-USE —
 *  a reload / second tab / duplicate POST can't mint a second paid order from the same screenshot. Returns
 *  the proof (screenshot + review flag) on success, or null if invalid/expired/already-used. */
export async function claimVerifiedProof(
  admin: SupabaseClient,
  verifyId: string,
  game: string,
  accountId: string,
  tag: string | null | undefined,
): Promise<{ screenshotPath: string | null; needsReview: boolean } | null> {
  const k = identityKey(game, accountId, tag);
  const freshFloor = new Date(Date.now() - VERIFY_TTL_MS).toISOString();
  const { data } = await admin
    .from("game_topup_verify_attempts")
    .update({ verified_at: null, updated_at: new Date().toISOString() })
    .eq("id", verifyId)
    .eq("game", k.game)
    .eq("account_norm", k.account_norm)
    .eq("tag", k.tag)
    .not("verified_at", "is", null) // not already consumed
    .gt("verified_at", freshFloor) // still fresh (evaluated on the pre-update row)
    .select("last_screenshot_path, needs_review");
  const row = data && data[0];
  if (!row) return null;
  return { screenshotPath: (row as { last_screenshot_path: string | null }).last_screenshot_path, needsReview: !!(row as { needs_review: boolean }).needs_review };
}

/** Record a successful screenshot match: reset the ladder, stamp verified_at + screenshot + review flag.
 *  Upserts the identity row and returns its id (the verifyId). */
export async function markVerified(
  admin: SupabaseClient,
  game: string,
  accountId: string,
  tag: string | null | undefined,
  opts: { screenshotPath: string; ocrText: string | null; needsReview: boolean },
): Promise<string | null> {
  const k = identityKey(game, accountId, tag);
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("game_topup_verify_attempts")
    .upsert(
      {
        ...k,
        tries: 0,
        block_level: 0,
        blocked_until: null,
        last_screenshot_path: opts.screenshotPath,
        last_ocr_text: opts.ocrText,
        needs_review: opts.needsReview,
        verified_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "game,account_norm,tag" },
    )
    .select("id")
    .single();
  if (error) {
    console.error("[game-topup verify] markVerified upsert failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/** Record a screenshot MISMATCH: advance the ladder ATOMICALLY (DB-side increment under the row lock via the
 *  game_topup_verify_bump RPC) so parallel OCR POSTs can't lost-update past the lockout. Every
 *  LOCK_AFTER_TRIES fails escalates the lockout (lock1 → lock2). Returns the tries-left / blocked-until. */
export async function bumpMismatch(
  admin: SupabaseClient,
  game: string,
  accountId: string,
  tag: string | null | undefined,
  opts: { screenshotPath: string; ocrText: string | null; lockMinutes1: number; lockMinutes2: number },
): Promise<{ triesLeft: number; blockedUntil: string | null }> {
  const k = identityKey(game, accountId, tag);
  const { data, error } = await admin.rpc("game_topup_verify_bump", {
    p_game: k.game,
    p_account_norm: k.account_norm,
    p_tag: k.tag,
    p_screenshot_path: opts.screenshotPath,
    p_ocr_text: opts.ocrText,
    p_lock_min1: opts.lockMinutes1,
    p_lock_min2: opts.lockMinutes2,
  });
  if (error) {
    console.error("[game-topup verify] bump rpc failed", error.message);
    return { triesLeft: LOCK_AFTER_TRIES - 1, blockedUntil: null };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { tries_left: number; blocked_until: string | null } | null;
  return { triesLeft: row?.tries_left ?? LOCK_AFTER_TRIES - 1, blockedUntil: row?.blocked_until ?? null };
}
