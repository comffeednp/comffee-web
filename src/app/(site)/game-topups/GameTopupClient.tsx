"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Loader2,
  Plus,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { formatPHP } from "@/lib/utils";

interface CatalogItem {
  sku: string;
  game: string;
  region: string;
  vp: number;
  label: string;
  price: number;
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  const game = games.find((g) => g.slug === gameSlug) ?? games[0];
  const currency = game?.currency ?? "VP";
  const packages = useMemo(
    () => catalog.filter((c) => c.game === gameSlug).sort((a, b) => a.vp - b.vp),
    [catalog, gameSlug],
  );
  const totalVp = cart.reduce((s, c) => s + c.vp, 0);
  const totalPrice = cart.reduce((s, c) => s + c.price, 0);

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
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setVerifyMsg(null);
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
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* ── LEFT: build the order + verify ─────────────────────────────── */}
      <div className="space-y-8 rounded-2xl border border-line-bright bg-bg-card p-6 md:p-8">
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

          {/* Sample so customers know exactly what to upload */}
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-bg/50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/game-topups-sample-profile.svg"
              alt="Example screenshot: a game profile with the name and tag visible, like Westbourne#SEA"
              className="h-24 w-auto shrink-0 rounded-md border border-line-bright"
            />
            <p className="font-mono text-[0.7rem] leading-relaxed text-mocha">
              <span className="text-cream-dim">Like this</span> — your name <span className="text-cream-dim">and #tag</span>{" "}
              must be clearly readable in the shot.
            </p>
          </div>

          <div
            onPaste={onPaste}
            className="mt-3 rounded-xl border border-dashed border-line-bright bg-bg p-4"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Your screenshot preview" className="mx-auto max-h-56 rounded-lg" />
            ) : (
              <div className="py-8 text-center">
                <Upload className="mx-auto h-7 w-7 text-mocha" />
                <p className="mt-2 font-mono text-xs text-mocha">paste an image, or pick a file</p>
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
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-sm text-cream-dim">Total</span>
            <span className="font-display text-2xl font-bold text-amber">{formatPHP(totalPrice)}</span>
          </div>
        </div>

        {verified && (
          <div className="space-y-4 border-t border-line-bright pt-4">
            <Field label="email (for your receipt) *">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="gt-input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
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
