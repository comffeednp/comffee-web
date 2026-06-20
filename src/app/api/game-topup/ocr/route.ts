import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { originAllowed, rateLimit, getClientIp } from "@/lib/security";
import { extractText, matchName } from "@/lib/game-topups/ocr";
import { getTopupSettings } from "@/lib/game-topups/config";
import { tryConsumeVisionCall } from "@/lib/game-topups/vision-budget";
import { verifyTurnstile } from "@/lib/game-topups/turnstile";
import { isPhAllowed } from "@/lib/game-topups/geo";
import {
  bumpMismatch,
  identityHash,
  identityKey,
  isLocked,
  loadAttempt,
  markVerified,
} from "@/lib/game-topups/verify-attempts";

export const runtime = "nodejs";

// Per-ACCOUNT screenshot verification for the multi-game cart. Verifies ONE (game, account) at a time and
// records the result in game_topup_verify_attempts (the per-identity try-ladder + verified record) — NO
// order is created here. The storefront calls this once per cart group; on success it gets back a verifyId
// it submits at checkout, where /pay re-validates it and builds the order's lines. Decoupling verification
// from the order is what lets one cart hold several screenshot-verified (game,account) groups paid in one go.
//
// Billing shield (unchanged): origin + IP rate limit → Turnstile seam → daily Vision circuit breaker →
// per-identity 3-try lockout → only then a Vision call. FAIL-OPEN when Vision is unconfigured/erroring
// (accept + flag for manual review); FAIL-CLOSED on a definitive name mismatch.

const BUCKET = "game-topup-screenshots"; // PRIVATE
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // uploads image-only, ≤2 MB
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  if (!isPhAllowed(request)) return NextResponse.json({ error: "ph_only" }, { status: 403 });
  if (!originAllowed(request)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const limited = rateLimit(request, "game-topup-ocr", 25, 10 * 60 * 1000);
  if (limited) return limited;

  const settings = await getTopupSettings();
  if (!settings.enabled) return NextResponse.json({ error: "disabled" }, { status: 503 });

  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }

  const game = String(form.get("game") ?? "").trim().toLowerCase();
  // accountId is the value matched in the screenshot (Riot name / Genshin UID / MLBB User ID). Accept the
  // legacy "riotId" field name as an alias for older clients.
  const accountId = String(form.get("accountId") ?? form.get("riotId") ?? "").trim();
  const tag = String(form.get("tag") ?? "").trim().replace(/^#/, "");
  const turnstileToken = form.get("turnstileToken") ? String(form.get("turnstileToken")) : null;

  if (!game) return NextResponse.json({ error: "missing_game" }, { status: 400 });
  if (accountId.length < 3 || !tag) return NextResponse.json({ error: "missing_account" }, { status: 400 });

  const image = form.get("image");
  if (!(image instanceof Blob)) return NextResponse.json({ error: "missing_image" }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "image_too_large" }, { status: 413 });
  if (!IMAGE_TYPES.has((image.type || "").toLowerCase())) {
    return NextResponse.json({ error: "bad_image_type" }, { status: 415 });
  }

  if (!(await verifyTurnstile(turnstileToken, getClientIp(request)))) {
    return NextResponse.json({ error: "bot_check_failed" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();

  // Server-side kill switch: never verify (or spend a Vision call) for a game that isn't active.
  const { data: gameRow } = await admin
    .from("game_topup_games")
    .select("active")
    .eq("slug", game)
    .maybeSingle();
  if (!gameRow || !(gameRow as { active: boolean }).active) {
    return NextResponse.json({ error: "game_unavailable" }, { status: 409 });
  }

  // Per-identity lockout: refuse WITHOUT spending a Vision call (the whole point of the ladder).
  const attempt = await loadAttempt(admin, game, accountId, tag);
  if (isLocked(attempt)) {
    return NextResponse.json({ error: "locked", blockedUntil: attempt!.blocked_until }, { status: 429 });
  }

  // Daily Vision circuit breaker (hard cost ceiling).
  if (!(await tryConsumeVisionCall(settings.visionDailyCap))) {
    console.error("[game-topup] Vision daily cap reached — OCR temporarily disabled");
    return NextResponse.json({ error: "verification_unavailable" }, { status: 503 });
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const { configured, text } = await extractText(buffer);

  // Always store the screenshot as evidence (private bucket; store the PATH only). Namespaced by identity
  // since no order exists yet; the stale-attempt sweep GCs abandoned ones.
  const k = identityKey(game, accountId, tag);
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const path = `verify/${game}/${identityHash(game, k.account_norm, k.tag)}/${randomUUID()}.jpg`;
  await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: image.type || "image/jpeg", upsert: false })
    .catch((e) => console.error("[game-topup] screenshot upload failed", e instanceof Error ? e.message : e));

  // FAIL-OPEN when Vision is down/unconfigured → accept but flag for manual staff review.
  const visionDown = !configured || text === null;
  const matched = visionDown ? true : matchName(text, accountId);

  if (matched) {
    const verifyId = await markVerified(admin, game, accountId, tag, {
      screenshotPath: path,
      ocrText: visionDown ? "[vision-unavailable: manual review]" : text,
      needsReview: visionDown,
    });
    if (!verifyId) return NextResponse.json({ error: "create_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, verified: true, verifyId, needsReview: visionDown });
  }

  // Mismatch → advance the per-identity ladder atomically. Every 3 fails escalates the lock (15m, then 24h).
  const { triesLeft, blockedUntil } = await bumpMismatch(admin, game, accountId, tag, {
    screenshotPath: path,
    ocrText: text ?? null,
    lockMinutes1: settings.ocrLockMinutes1,
    lockMinutes2: settings.ocrLockMinutes2,
  });
  return NextResponse.json({ ok: true, verified: false, triesLeft, blockedUntil });
}
