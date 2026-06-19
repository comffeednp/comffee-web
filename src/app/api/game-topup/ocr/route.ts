import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { originAllowed, rateLimit, getClientIp } from "@/lib/security";
import { extractText, matchName, normalizeName } from "@/lib/game-topups/ocr";
import { getTopupSettings } from "@/lib/game-topups/config";
import { tryConsumeVisionCall } from "@/lib/game-topups/vision-budget";
import { verifyTurnstile } from "@/lib/game-topups/turnstile";
import { isPhAllowed } from "@/lib/game-topups/geo";

export const runtime = "nodejs";

// Screenshot verification + draft-order creation. The 3-try ladder is keyed to the ORDER (not the IP —
// a cafe shares one NAT). Billing shield: origin + IP rate limit → Turnstile seam → daily Vision
// circuit breaker → only then a Vision call. FAIL-OPEN when Vision is unconfigured/erroring (accept +
// flag for manual review); FAIL-CLOSED on a definitive name mismatch.

const BUCKET = "game-topup-screenshots"; // PRIVATE
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // §5: uploads image-only, ≤2 MB
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

  const riotId = String(form.get("riotId") ?? "").trim();
  const tag = String(form.get("tag") ?? "").trim().replace(/^#/, "");
  const orderIdIn = form.get("orderId") ? String(form.get("orderId")) : null;
  const turnstileToken = form.get("turnstileToken") ? String(form.get("turnstileToken")) : null;
  let skus: string[] = [];
  try {
    const raw = form.get("skus");
    const parsed = raw ? JSON.parse(String(raw)) : [];
    skus = Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, 20) : [];
  } catch {
    skus = [];
  }

  if (riotId.length < 3 || !tag) return NextResponse.json({ error: "missing_riot_id" }, { status: 400 });

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

  // Resolve an existing draft (so retries share one ladder) or create a new draft from the catalog.
  type DraftRow = {
    id: string;
    ocr_tries: number;
    ocr_block_level: number;
    ocr_blocked_until: string | null;
    status: string;
  };
  let order: DraftRow | null = null;

  if (orderIdIn) {
    const { data } = await admin
      .from("game_topup_orders")
      .select("id, ocr_tries, ocr_block_level, ocr_blocked_until, status")
      .eq("id", orderIdIn)
      .maybeSingle();
    if (data && (data.status === "draft" || data.status === "verified")) order = data as DraftRow;
  }

  if (!order) {
    // Identity-keyed lock: a bot can't dodge the 3-try lockout by minting a fresh draft each attempt — if
    // a recent draft for the SAME normalized Riot ID + #tag is still locked, refuse HERE (no Vision call,
    // no new draft). The per-order ladder alone is keyed to a row a bot would just abandon.
    {
      const tnorm = normalizeName(riotId);
      const { data: recentLocked } = await admin
        .from("game_topup_orders")
        .select("riot_id, ocr_blocked_until")
        .eq("riot_tag", tag)
        .eq("status", "draft")
        .gt("ocr_blocked_until", new Date().toISOString())
        .order("ocr_blocked_until", { ascending: false })
        .limit(25);
      const hit = (recentLocked ?? []).find((r) => normalizeName(r.riot_id as string) === tnorm);
      if (hit) {
        return NextResponse.json(
          { error: "locked", blockedUntil: (hit as { ocr_blocked_until: string }).ocr_blocked_until },
          { status: 429 },
        );
      }
    }
    if (skus.length === 0) return NextResponse.json({ error: "no_packages" }, { status: 400 });
    const { data: cat } = await admin
      .from("game_topup_catalog")
      .select("sku, game, region, vp_amount, codashop_price, customer_price, active, frozen")
      .in("sku", skus);
    const bySku = new Map((cat ?? []).map((c) => [c.sku as string, c]));
    const lines: Array<{ sku: string; vp_amount: number; codashop_price: number; customer_price: number; position: number }> = [];
    let amount = 0;
    let targetVp = 0;
    let game = "valorant";
    let region = "AP";
    for (let i = 0; i < skus.length; i++) {
      const c = bySku.get(skus[i]);
      if (!c || !c.active || c.frozen) {
        return NextResponse.json({ error: "package_unavailable", sku: skus[i] }, { status: 409 });
      }
      game = c.game;
      region = c.region;
      lines.push({ sku: c.sku, vp_amount: c.vp_amount, codashop_price: c.codashop_price, customer_price: c.customer_price, position: i });
      amount += Number(c.customer_price);
      targetVp += Number(c.vp_amount);
    }
    const { data: created, error: insErr } = await admin
      .from("game_topup_orders")
      .insert({ game, region, riot_id: riotId, riot_tag: tag, target_vp: targetVp, amount_php: amount, status: "draft" })
      .select("id, ocr_tries, ocr_block_level, ocr_blocked_until, status")
      .single();
    if (insErr || !created) {
      console.error("[game-topup] draft create failed", insErr?.message);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    order = created as DraftRow;
    const { error: lineErr } = await admin
      .from("game_topup_order_lines")
      .insert(lines.map((l) => ({ order_id: created.id, ...l })));
    if (lineErr) {
      await admin.from("game_topup_orders").delete().eq("id", created.id);
      console.error("[game-topup] line insert failed", lineErr.message);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
  }

  // Locked? Refuse WITHOUT spending a Vision call (the whole point of the ladder).
  if (order.ocr_blocked_until && new Date(order.ocr_blocked_until) > new Date()) {
    return NextResponse.json({ error: "locked", orderId: order.id, blockedUntil: order.ocr_blocked_until }, { status: 429 });
  }

  // Daily Vision circuit breaker (hard cost ceiling).
  if (!(await tryConsumeVisionCall(settings.visionDailyCap))) {
    console.error("[game-topup] Vision daily cap reached — OCR temporarily disabled");
    return NextResponse.json({ error: "verification_unavailable" }, { status: 503 });
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const { configured, text } = await extractText(buffer);

  // Always store the screenshot as evidence (private bucket; store the PATH only).
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const path = `${order.id}/${randomUUID()}.jpg`;
  await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: image.type || "image/jpeg", upsert: false })
    .catch((e) => console.error("[game-topup] screenshot upload failed", e instanceof Error ? e.message : e));

  // FAIL-OPEN when Vision is down/unconfigured → accept but flag for manual staff review.
  const visionDown = !configured || text === null;
  const matched = visionDown ? true : matchName(text, riotId);

  if (matched) {
    await admin
      .from("game_topup_orders")
      .update({
        status: "verified",
        verified: true,
        screenshot_path: path,
        ocr_text: visionDown ? "[vision-unavailable: manual review]" : text,
        ocr_tries: 0,
        ocr_block_level: 0,
        ocr_blocked_until: null,
      })
      .eq("id", order.id)
      .in("status", ["draft", "verified"]);
    return NextResponse.json({ ok: true, verified: true, orderId: order.id, needsReview: visionDown });
  }

  // Mismatch → advance the ladder. Every 3 fails escalates the lock (15 min, then 24 h …).
  const tries = (order.ocr_tries || 0) + 1;
  const update: Record<string, unknown> = { screenshot_path: path, ocr_text: text ?? null };
  let blockedUntil: string | null = null;
  if (tries >= 3) {
    const lvl = order.ocr_block_level || 0;
    const lockMin = lvl === 0 ? settings.ocrLockMinutes1 : settings.ocrLockMinutes2;
    blockedUntil = new Date(Date.now() + lockMin * 60000).toISOString();
    update.ocr_block_level = lvl + 1;
    update.ocr_blocked_until = blockedUntil;
    update.ocr_tries = 0;
  } else {
    update.ocr_tries = tries;
  }
  await admin.from("game_topup_orders").update(update).eq("id", order.id);
  return NextResponse.json({
    ok: true,
    verified: false,
    orderId: order.id,
    triesLeft: blockedUntil ? 0 : Math.max(0, 3 - tries),
    blockedUntil,
  });
}
