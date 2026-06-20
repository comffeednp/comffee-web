"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Gem,
  Loader2,
  Plus,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { gameArt } from "@/lib/game-topups/games-art";

// Small keyboard-key chip used in the "how to paste" steps.
const kbdCls = "rounded border border-line-bright bg-bg-card px-1.5 py-0.5 text-cream-dim";

interface CatalogItem {
  sku: string;
  game: string;
  region: string;
  vp: number;
  label: string;
  price: number;
  /** Codashop's own ₱ price (public) — what they'd pay buying direct; used to show the savings. */
  original: number;
}
interface GameInfo {
  slug: string;
  name: string;
  region: string;
  currency: string;
}
interface Props {
  catalog: CatalogItem[];
  games: GameInfo[];
}

// Downscale a phone screenshot to <=1600px JPEG before upload — keeps the in-game name crisp for OCR
// while staying under the 2 MB cap. Falls back to the original on any failure.
async function shrinkImage(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}

// Split a combined Riot ID ("Name#TAG") into its parts. Riot game names can't contain '#', so we split
// at the first '#'. Returns null until BOTH a name (>=3 chars) and a tag are present.
function splitRiotId(full: string): { name: string; tag: string } | null {
  const s = (full || "").trim();
  const i = s.indexOf("#");
  if (i < 1) return null;
  const name = s.slice(0, i).trim();
  const tag = s.slice(i + 1).trim().replace(/^#+/, "");
  if (name.length < 3 || tag.length < 1) return null;
  return { name, tag };
}

export default function GameTopupClient({ catalog, games }: Props) {
  const [gameSlug, setGameSlug] = useState(games[0]?.slug ?? catalog[0]?.game ?? "valorant");
  const [cart, setCart] = useState<CatalogItem[]>([]);
  const [riotIdFull, setRiotIdFull] = useState(""); // single field — "Name#TAG"

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false); // "Remove this screenshot?" prompt
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [sampleZoom, setSampleZoom] = useState(false);

  // While the enlarged sample is open: close on Escape + lock body scroll behind it.
  useEffect(() => {
    if (!sampleZoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSampleZoom(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sampleZoom]);

  const game = games.find((g) => g.slug === gameSlug) ?? games[0];
  const currency = game?.currency ?? "VP";
  const art = gameArt(gameSlug);
  // Scope the whole store to this game's signature color: overriding --color-amber re-tints every
  // `amber` utility (tiles, prices, total, focus ring) for the selected game. Falls back to brand amber.
  const accent = art?.accent ?? "#ffb547";
  const packages = useMemo(
    () => catalog.filter((c) => c.game === gameSlug).sort((a, b) => a.vp - b.vp),
    [catalog, gameSlug],
  );
  const totalVp = cart.reduce((s, c) => s + c.vp, 0);
  const totalPrice = cart.reduce((s, c) => s + c.price, 0);
  // Savings vs Codashop's own price (what they'd pay buying direct).
  const totalOriginal = cart.reduce((s, c) => s + (c.original || c.price), 0);
  const totalSavings = Math.max(0, totalOriginal - totalPrice);
  const savingsPct = totalOriginal > 0 ? Math.round((totalSavings / totalOriginal) * 100) : 0;

  const parsedRiot = splitRiotId(riotIdFull);
  const detailsReady = cart.length > 0 && !!parsedRiot;

  // Any change to the cart/game while NOT yet verified must drop the server draft binding: the OCR route
  // froze the order lines on the first attempt, so reusing that orderId would charge/deliver the OLD cart
  // while the UI shows the new one. Clearing orderId makes the next verify recreate the draft from the
  // current packages. (The screenshot is kept — it's the same account.)
  const resetVerifyDraft = () => {
    setOrderId(null);
    setVerifyMsg(null);
    setBlockedUntil(null);
  };

  const addPackage = (p: CatalogItem) => {
    if (verified) return; // locked once verified — changing the order would invalidate the verified price
    setCart((c) => [...c, p]);
    resetVerifyDraft();
  };
  const removeAt = (i: number) => {
    if (verified) return;
    setCart((c) => c.filter((_, idx) => idx !== i));
    resetVerifyDraft();
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview); // replace: free the old preview's memory
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setVerifyMsg(null);
    setConfirmClear(false);
  };

  // × on the preview → confirm → clear, so they can paste/pick a fresh screenshot. Keeps the cart/account
  // (same order draft); only the image is dropped. Refocuses the paste box so Ctrl+V works immediately.
  const clearShot = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setVerifyMsg(null);
    setConfirmClear(false);
    setTimeout(() => dropRef.current?.focus(), 0);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) {
      const f = item.getAsFile();
      if (f) pickFile(f);
    }
  };

  const verify = async () => {
    const parsed = splitRiotId(riotIdFull);
    if (!parsed || !file) return;
    setVerifying(true);
    setVerifyMsg(null);
    setBlockedUntil(null);
    try {
      const shrunk = await shrinkImage(file);
      const fd = new FormData();
      fd.append("riotId", parsed.name);
      fd.append("tag", parsed.tag);
      fd.append("skus", JSON.stringify(cart.map((c) => c.sku)));
      if (orderId) fd.append("orderId", orderId);
      fd.append("image", shrunk, "screenshot.jpg");
      const res = await fetch("/api/game-topup/ocr", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (data.orderId) setOrderId(data.orderId);

      if (res.status === 429 || data.error === "locked") {
        setBlockedUntil(data.blockedUntil ?? null);
        setVerifyMsg("Too many tries. Please wait before trying again.");
        return;
      }
      if (!res.ok && !("verified" in data)) {
        setVerifyMsg(humanError(data.error));
        return;
      }
      if (data.verified) {
        setVerified(true);
        setNeedsReview(!!data.needsReview);
        return;
      }
      const left = typeof data.triesLeft === "number" ? data.triesLeft : null;
      setVerifyMsg(
        left !== null && left > 0
          ? `That screenshot doesn't show "${parsed.name}". ${left} ${left === 1 ? "try" : "tries"} left — make sure your in-game name and tag are clearly visible.`
          : "We couldn't match that screenshot to your Riot ID.",
      );
    } catch {
      setVerifyMsg("Network error — please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const pay = async () => {
    if (!orderId || !verified || !consent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    setPaying(true);
    setPayMsg(null);
    try {
      const res = await fetch("/api/game-topup/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, email: email.trim(), consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setPayMsg(humanError(data.error));
    } catch {
      setPayMsg("Network error — please try again.");
    } finally {
      setPaying(false);
    }
  };

  const blockedLabel = blockedUntil
    ? new Date(blockedUntil).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div
      className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.4fr_1fr]"
      style={{ "--color-amber": accent } as CSSProperties}
    >
      {/* ── LEFT: build the order + verify ─────────────────────────────── */}
      <div className="space-y-8 rounded-2xl border border-line-bright bg-bg-card p-6 md:p-8">
        {/* Game header — clean + branded with the game's own accent color (no third-party logos/art) */}
        <div
          className="flex items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: `${accent}55`, background: `linear-gradient(90deg, ${accent}1f, transparent 72%)` }}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}26` }}
          >
            <Gem className="h-6 w-6" style={{ color: accent }} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight text-cream">
              {game?.name ?? "Game"} top-up
            </p>
            <p className="mt-0.5 font-mono text-[0.7rem] uppercase tracking-wide text-mocha">
              {currency} · delivered to your account · 8% below Codashop
            </p>
          </div>
        </div>

        {/* Game */}
        {games.length > 1 && (
          <div>
            <p className="terminal-label">// game</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {games.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => {
                    if (verified) return;
                    setGameSlug(g.slug);
                    setCart([]);
                    resetVerifyDraft();
                  }}
                  title={`Choose ${g.name}`}
                  disabled={verified}
                  className={`rounded-lg border p-4 text-left transition disabled:opacity-50 ${
                    gameSlug === g.slug
                      ? "border-amber bg-amber/10 glow-amber"
                      : "border-line-bright bg-bg hover:border-amber/60"
                  }`}
                >
                  <p className="font-display font-semibold text-cream">{g.name}</p>
                  <p className="mt-1 font-mono text-[0.7rem] uppercase text-mocha">{g.region} · {g.currency}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Packages */}
        <div>
          <p className="terminal-label">// add packages (combine for any total)</p>
          <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-3">
            {packages.map((p) => (
              <button
                key={p.sku}
                type="button"
                onClick={() => addPackage(p)}
                disabled={verified}
                title={`Add ${p.label} for ${formatPHP(p.price)}`}
                className="flex flex-col rounded-lg border border-line-bright bg-bg p-3 text-left transition hover:border-amber/60 disabled:opacity-50"
              >
                <span className="flex items-center justify-between font-mono font-bold text-cream">
                  {p.vp.toLocaleString()} {currency}
                  <Plus className="h-3.5 w-3.5 text-amber" />
                </span>
                <span className="mt-1 font-mono text-xs text-amber">{formatPHP(p.price)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Riot ID — ONE field, must include the #tag */}
        <div>
          <Field label="riot id — include your #tag *">
            <input
              type="text"
              value={riotIdFull}
              onChange={(e) => {
                setRiotIdFull(e.target.value);
                resetVerifyDraft();
              }}
              disabled={verified}
              className="gt-input"
              placeholder="Westbourne#SEA"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <p className="mt-1.5 font-mono text-[0.7rem] text-mocha">
            Type it exactly as in-game, <span className="text-cream-dim">including the # and your tag</span> — e.g.{" "}
            <span className="text-cream-dim">Westbourne#SEA</span>.
          </p>
        </div>

        {/* Email — collected up front (required to pay); this is where the receipt is sent. */}
        <div>
          <Field label="email — required *">
            <input
              type="email"
              required
              aria-required="true"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="gt-input"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <p className="mt-1.5 font-mono text-[0.7rem] text-mocha">
            // your receipt &amp; order status are emailed here — double-check it&rsquo;s correct
          </p>
        </div>

        {/* Verify */}
        <div>
          <p className="terminal-label">// prove it&rsquo;s your account</p>
          <p className="mt-2 text-sm text-cream-dim">
            Paste or upload a screenshot of your in-game profile clearly showing your <strong>name and #tag</strong>
            {parsedRiot ? (
              <>
                {" "}(
                <strong className="text-cream">
                  {parsedRiot.name}#{parsedRiot.tag}
                </strong>
                )
              </>
            ) : null}
            . We read it to make sure the points land on the right account.
          </p>

          {/* Sample so customers know exactly what to upload — tap to enlarge */}
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-bg/50 p-3">
            <button
              type="button"
              onClick={() => setSampleZoom(true)}
              title="Tap to enlarge the example"
              className="group relative shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-line-bright transition hover:border-amber/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/games/game-topups-sample-profile.svg"
                alt="Example: your game account menu showing your name and #tag — copy it exactly"
                className="h-24 w-auto"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1 right-1 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wide text-cream-dim"
              >
                ⤢ enlarge
              </span>
            </button>
            <p className="font-mono text-[0.7rem] leading-relaxed text-mocha">
              <span className="text-cream-dim">Like this</span> — your name <span className="text-cream-dim">and #tag</span>{" "}
              must be clearly readable in the shot. <span className="text-cream-dim">Tap the image to enlarge.</span>
            </p>
          </div>

          {/* Enlarged sample lightbox (centered) — portal so a transformed ancestor can't trap it */}
          {sampleZoom &&
            createPortal(
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Example game profile, enlarged"
                onClick={() => setSampleZoom(false)}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
              >
                <button
                  type="button"
                  onClick={() => setSampleZoom(false)}
                  title="Close"
                  aria-label="Close enlarged example"
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-line-bright bg-bg-card text-cream-dim transition hover:border-amber/60 hover:text-amber"
                >
                  <X className="h-5 w-5" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/games/game-topups-sample-profile.svg"
                  alt="Example: your game account menu showing your name and #tag — copy it exactly"
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[85vh] w-auto max-w-[92vw] cursor-default rounded-xl border border-line-bright shadow-2xl"
                />
              </div>,
              document.body,
            )}

          {/* How to paste a screenshot — 4 simple steps */}
          <ol className="mt-4 space-y-1.5 font-mono text-[0.72rem] leading-relaxed text-mocha">
            <li>
              <span className="text-amber">1.</span> Press <kbd className={kbdCls}>Print Screen</kbd>{" "}
              <span className="text-mocha/80">(or <kbd className={kbdCls}>Win</kbd>+<kbd className={kbdCls}>Shift</kbd>+<kbd className={kbdCls}>S</kbd> to snip)</span>
            </li>
            <li>
              <span className="text-amber">2.</span> Capture your <span className="text-cream-dim">Riot ID &amp; #tag</span> (your account menu)
            </li>
            <li>
              <span className="text-amber">3.</span> <span className="text-cream-dim">Click the box below</span>, then press <kbd className={kbdCls}>Ctrl</kbd>+<kbd className={kbdCls}>V</kbd> to paste
            </li>
            <li>
              <span className="text-amber">4.</span> Press <span className="text-cream-dim">Verify account</span>
            </li>
          </ol>

          <div
            ref={dropRef}
            onPaste={onPaste}
            tabIndex={0}
            aria-label="Click here, then press Ctrl + V to paste your screenshot"
            className="mt-3 cursor-pointer rounded-xl border border-dashed border-line-bright bg-bg p-4 outline-none transition focus:border-amber/70 focus-visible:ring-2 focus-visible:ring-amber"
          >
            {preview ? (
              <div className="relative mx-auto w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Your screenshot preview" className="mx-auto max-h-56 rounded-lg" />
                {!verified && (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    title="Remove this screenshot"
                    aria-label="Remove this screenshot"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-line-bright bg-bg/90 text-cream-dim backdrop-blur transition hover:border-rgb-r/60 hover:text-rgb-r"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {confirmClear && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-bg/90 p-4 text-center backdrop-blur-sm">
                    <p className="font-mono text-sm text-cream">Remove this screenshot?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={clearShot}
                        title="Remove the screenshot"
                        className="rounded-lg bg-rgb-r px-3.5 py-1.5 text-xs font-bold text-cream transition hover:brightness-110"
                      >
                        Yes, remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        title="Keep the screenshot"
                        className="rounded-lg border border-line-bright px-3.5 py-1.5 text-xs text-cream-dim transition hover:text-cream"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Upload className="mx-auto h-7 w-7 text-mocha" />
                <p className="mt-2 font-mono text-xs text-mocha">
                  click here, then <span className="text-cream-dim">Ctrl + V</span> to paste — or pick a file
                </p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={verified}
                title="Choose a screenshot file"
                className="key-cap disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {preview ? "Choose a different screenshot" : "Choose screenshot"}
              </button>
            </div>
          </div>

          {verified ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-phosphor/40 bg-phosphor/10 p-3">
              <ShieldCheck className="h-4 w-4 text-phosphor" />
              <p className="font-mono text-xs text-phosphor">
                // account verified{needsReview ? " (pending a quick manual check)" : ""}
              </p>
            </div>
          ) : (
            <>
              {verifyMsg && (
                <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber/40 bg-amber/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber" />
                  <p className="text-xs text-amber">
                    {verifyMsg}
                    {blockedLabel ? ` Try again after ${blockedLabel}.` : ""}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={verify}
                disabled={!detailsReady || !file || verifying || !!blockedUntil}
                title="Verify your account from the screenshot"
                className="key-cap mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {verifying ? "Checking…" : "Verify account"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: cart + pay ──────────────────────────────────────────── */}
      <div className="space-y-4 rounded-2xl border border-line-bright bg-bg-card p-6 md:p-8 lg:sticky lg:top-24 lg:self-start">
        <p className="terminal-label">// your order</p>
        {cart.length === 0 ? (
          <p className="font-mono text-xs text-mocha">add a package to begin</p>
        ) : (
          <ul className="space-y-2">
            {cart.map((c, i) => (
              <li key={`${c.sku}-${i}`} className="flex items-center justify-between rounded-lg border border-line bg-bg px-3 py-2">
                <span className="font-mono text-sm text-cream">{c.vp.toLocaleString()} {currency}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-amber">{formatPHP(c.price)}</span>
                  {!verified && (
                    <button type="button" onClick={() => removeAt(i)} title="Remove this package" className="text-mocha hover:text-rgb-r">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-line-bright pt-3">
          <div className="flex items-center justify-between font-mono text-sm text-cream-dim">
            <span>Total {currency}</span>
            <span className="text-cream">{totalVp.toLocaleString()}</span>
          </div>
          {totalSavings > 0 && (
            <>
              <div className="mt-1 flex items-center justify-between font-mono text-sm">
                <span className="text-mocha">Codashop price</span>
                <span className="text-mocha line-through">{formatPHP(totalOriginal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-sm">
                <span className="text-phosphor">You save · {savingsPct}% off</span>
                <span className="font-semibold text-phosphor">{formatPHP(totalSavings)}</span>
              </div>
            </>
          )}
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-sm text-cream-dim">You pay</span>
            <span className="font-display text-2xl font-bold text-amber">{formatPHP(totalPrice)}</span>
          </div>
        </div>

        {verified && (
          <div className="space-y-4 border-t border-line-bright pt-4">
            <label className="flex cursor-pointer items-start gap-3 text-xs text-cream-dim">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber"
              />
              <span>
                My Riot ID and amount are correct. I understand that once delivered to the account I proved is mine,
                <strong className="text-cream"> there are no refunds</strong>.
              </span>
            </label>
            <p className="text-[0.7rem] leading-relaxed text-mocha">
              If we can&rsquo;t deliver (e.g. a temporary outage), your payment is{" "}
              <strong className="text-cream-dim">credited within 24 hours</strong> — or{" "}
              <strong className="text-cream-dim">fully refunded</strong>.
            </p>
            {payMsg && (
              <div className="flex items-start gap-3 rounded-lg border border-red-700 bg-red-950/20 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-red-400" />
                <p className="font-mono text-xs text-red-400">// {payMsg}</p>
              </div>
            )}
            <button
              type="button"
              onClick={pay}
              disabled={!consent || paying || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
              title="Pay and place your order"
              className="key-cap key-cap-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
            >
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {paying ? "Routing to checkout…" : `Pay ${formatPHP(totalPrice)}`}
            </button>
            <p className="text-center font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
              // gcash · card · secured by paymongo
            </p>
          </div>
        )}

        {!verified && (
          <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
            <Check className="h-3 w-3" /> verify your account to pay
          </p>
        )}
      </div>

      <style>{`
        .gt-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.625rem;
          padding: 0.75rem 1rem;
          color: var(--color-cream);
          font-family: var(--font-mono);
          font-size: 0.95rem;
          color-scheme: dark;
        }
        .gt-input:focus { outline: none; border-color: var(--color-amber); box-shadow: 0 0 0 1px rgba(255,181,71,0.4); }
        .gt-input:disabled { opacity: 0.6; }
      `}</style>
    </div>
  );
}

function humanError(code: unknown): string {
  const map: Record<string, string> = {
    ph_only: "Game top-ups are available in the Philippines only.",
    disabled: "Game top-ups are temporarily unavailable.",
    not_verified: "Please verify your account first.",
    package_unavailable: "One of those packages is no longer available — please re-add it.",
    invalid_amount: "Something's off with the total — please rebuild your order.",
    checkout_failed: "Couldn't start checkout — please try again.",
    fulfilment_unavailable:
      "Top-ups are paused right now — our supplier is temporarily unreachable, so we can't take payment. You haven't been charged; please try again shortly.",
    rate_limited: "Too many attempts — please wait a moment.",
  };
  return (typeof code === "string" && map[code]) || "Something went wrong — please try again.";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">// {label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
