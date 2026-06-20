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
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { gameArt } from "@/lib/game-topups/games-art";
import { accountConfig, buildIdentity, formatIdentity } from "@/lib/game-topups/accounts";

const kbdCls = "rounded border border-line-bright bg-bg-card px-1.5 py-0.5 text-cream-dim";

interface CatalogItem {
  sku: string;
  game: string;
  region: string;
  vp: number;
  label: string;
  price: number;
  /** Codashop's own ₱ price (public) — used to show the savings. */
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

// One cart GROUP = one (game, account). The order is several groups checked out in ONE payment, each
// screenshot-verified on its own (verifyId from /api/game-topup/ocr).
interface Group {
  id: string;
  gameSlug: string;
  riotIdFull: string; // riot-mode combined "Name#TAG"
  acctId: string; // pair-mode id (Genshin UID / MLBB User ID)
  acctTag: string; // pair-mode tag (Genshin server / MLBB Zone)
  file: File | null;
  preview: string | null;
  verified: boolean;
  verifyId: string | null;
  needsReview: boolean;
  verifying: boolean;
  verifyMsg: string | null;
  blockedUntil: string | null;
  lines: CatalogItem[];
}

function newGroup(gameSlug: string): Group {
  return {
    id: crypto.randomUUID(),
    gameSlug,
    riotIdFull: "",
    acctId: "",
    acctTag: "",
    file: null,
    preview: null,
    verified: false,
    verifyId: null,
    needsReview: false,
    verifying: false,
    verifyMsg: null,
    blockedUntil: null,
    lines: [],
  };
}

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

const identityOf = (g: Group) => buildIdentity(g.gameSlug, { combined: g.riotIdFull, id: g.acctId, tag: g.acctTag });

export default function GameTopupClient({ catalog, games }: Props) {
  const firstGame = games[0]?.slug ?? catalog[0]?.game ?? "valorant";
  const [groups, setGroups] = useState<Group[]>(() => [newGroup(firstGame)]);
  const [activeId, setActiveId] = useState<string>(() => groups[0].id);

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [sampleZoom, setSampleZoom] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const active = groups.find((g) => g.id === activeId) ?? groups[0];

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

  const patchGroup = (id: string, patch: Partial<Group>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  // Editing the account/game invalidates that group's verification (must re-prove). Free any old preview.
  const resetVerify = (id: string, extra: Partial<Group> = {}) =>
    patchGroup(id, { verified: false, verifyId: null, needsReview: false, verifyMsg: null, blockedUntil: null, ...extra });

  const game = games.find((g) => g.slug === active.gameSlug) ?? games[0];
  const currency = game?.currency ?? "VP";
  const art = gameArt(active.gameSlug);
  const accent = art?.accent ?? "#ffb547";
  const cfg = accountConfig(active.gameSlug);
  const packages = useMemo(
    () => catalog.filter((c) => c.game === active.gameSlug).sort((a, b) => a.vp - b.vp),
    [catalog, active.gameSlug],
  );
  const parsedActive = identityOf(active);

  // Order-wide totals across ALL groups' lines.
  const allLines = groups.flatMap((g) => g.lines);
  const totalPrice = allLines.reduce((s, c) => s + c.price, 0);
  const totalOriginal = allLines.reduce((s, c) => s + (c.original || c.price), 0);
  const totalSavings = Math.max(0, totalOriginal - totalPrice);
  const savingsPct = totalOriginal > 0 ? Math.round((totalSavings / totalOriginal) * 100) : 0;

  const groupsWithLines = groups.filter((g) => g.lines.length > 0);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Payable: at least one line, every line-bearing group screenshot-verified + has a valid identity.
  const canPay =
    groupsWithLines.length > 0 &&
    groupsWithLines.every((g) => g.verified && !!g.verifyId && !!identityOf(g)) &&
    emailOk &&
    consent;
  const needsReverify = groupsWithLines.filter((g) => !g.verified);

  // ── active-group editing ──────────────────────────────────────────────
  const switchGame = (slug: string) => {
    if (active.verified) return; // locked once verified; edit needs a re-verify path below
    // New game → different catalog + account shape → clear lines + account + verification.
    patchGroup(active.id, {
      gameSlug: slug,
      riotIdFull: "",
      acctId: "",
      acctTag: "",
      lines: [],
      verified: false,
      verifyId: null,
      needsReview: false,
      verifyMsg: null,
      blockedUntil: null,
    });
  };

  const addPackage = (p: CatalogItem) => {
    if (!active.verified) return; // amounts unlock only after the account is screenshot-verified
    patchGroup(active.id, { lines: [...active.lines, p] });
  };
  const removeLineAt = (gid: string, i: number) =>
    setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, lines: g.lines.filter((_, idx) => idx !== i) } : g)));

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (active.preview) URL.revokeObjectURL(active.preview);
    patchGroup(active.id, { file: f, preview: URL.createObjectURL(f), verifyMsg: null });
    setConfirmClear(false);
  };
  const clearShot = () => {
    if (active.preview) URL.revokeObjectURL(active.preview);
    patchGroup(active.id, { file: null, preview: null, verifyMsg: null });
    setConfirmClear(false);
    setTimeout(() => dropRef.current?.focus(), 0);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (active.verified) return; // a verified group's screenshot is immutable (matches the disabled controls)
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) {
      const f = item.getAsFile();
      if (f) pickFile(f);
    }
  };

  const verify = async () => {
    const parsed = identityOf(active);
    if (!parsed || !active.file) return;
    patchGroup(active.id, { verifying: true, verifyMsg: null, blockedUntil: null });
    try {
      const shrunk = await shrinkImage(active.file);
      const fd = new FormData();
      fd.append("game", active.gameSlug);
      fd.append("accountId", parsed.accountId);
      fd.append("tag", parsed.tag);
      fd.append("image", shrunk, "screenshot.jpg");
      const res = await fetch("/api/game-topup/ocr", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429 || data.error === "locked") {
        patchGroup(active.id, { blockedUntil: data.blockedUntil ?? null, verifyMsg: "Too many tries. Please wait before trying again." });
        return;
      }
      if (!res.ok && !("verified" in data)) {
        patchGroup(active.id, { verifyMsg: humanError(data.error) });
        return;
      }
      if (data.verified && data.verifyId) {
        patchGroup(active.id, { verified: true, verifyId: data.verifyId, needsReview: !!data.needsReview, verifyMsg: null });
        return;
      }
      const left = typeof data.triesLeft === "number" ? data.triesLeft : null;
      patchGroup(active.id, {
        verifyMsg:
          left !== null && left > 0
            ? `That screenshot doesn't show "${parsed.accountId}". ${left} ${left === 1 ? "try" : "tries"} left — make sure ${cfg.proofWhat} is clearly visible.`
            : "We couldn't match that screenshot to your account.",
      });
    } catch {
      patchGroup(active.id, { verifyMsg: "Network error — please try again." });
    } finally {
      patchGroup(active.id, { verifying: false });
    }
  };

  const addAnother = () => {
    const g = newGroup(firstGame);
    setGroups((gs) => [...gs, g]);
    setActiveId(g.id);
  };
  const removeGroup = (id: string) => {
    setGroups((gs) => {
      const next = gs.filter((g) => g.id !== id);
      const ensured = next.length ? next : [newGroup(firstGame)];
      if (id === activeId) setActiveId(ensured[0].id);
      return ensured;
    });
  };

  const pay = async () => {
    if (!canPay) return;
    setPaying(true);
    setPayMsg(null);
    try {
      const payloadGroups = groupsWithLines.map((g) => {
        const idy = identityOf(g)!;
        return {
          game: g.gameSlug,
          accountId: idy.accountId,
          accountTag: idy.tag,
          verifyId: g.verifyId,
          skus: g.lines.map((l) => l.sku),
        };
      });
      const res = await fetch("/api/game-topup/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: payloadGroups, email: email.trim(), consent: true }),
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

  const blockedLabel = active.blockedUntil
    ? new Date(active.blockedUntil).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div
      className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.4fr_1fr]"
      style={{ "--color-amber": accent } as CSSProperties}
    >
      {/* ── LEFT: build the active (game,account) group ─────────────────── */}
      <div className="space-y-8 rounded-2xl border border-line-bright bg-bg-card p-6 md:p-8">
        {/* Game header */}
        <div
          className="flex items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: `${accent}55`, background: `linear-gradient(90deg, ${accent}1f, transparent 72%)` }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}26` }}>
            <Gem className="h-6 w-6" style={{ color: accent }} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight text-cream">{game?.name ?? "Game"} top-up</p>
            <p className="mt-0.5 font-mono text-[0.7rem] uppercase tracking-wide text-mocha">
              {currency} · delivered to your account · 8% off original price
            </p>
          </div>
        </div>

        {/* Game selector */}
        {games.length > 1 && (
          <div>
            <p className="terminal-label">// game</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {games.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => switchGame(g.slug)}
                  title={`Choose ${g.name}`}
                  disabled={active.verified}
                  className={`rounded-lg border p-4 text-left transition disabled:opacity-50 ${
                    active.gameSlug === g.slug ? "border-amber bg-amber/10 glow-amber" : "border-line-bright bg-bg hover:border-amber/60"
                  }`}
                >
                  <p className="font-display font-semibold text-cream">{g.name}</p>
                  <p className="mt-1 font-mono text-[0.7rem] uppercase text-mocha">{g.region} · {g.currency}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 1 · ACCOUNT (per-game, account-first) */}
        {cfg.mode === "riot" ? (
          <div>
            <Field label={`1 · ${cfg.idLabel} *`}>
              <input
                type="text"
                value={active.riotIdFull}
                onChange={(e) => resetVerify(active.id, { riotIdFull: e.target.value })}
                disabled={active.verified}
                className="gt-input"
                placeholder={cfg.idPlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <p className="mt-1.5 font-mono text-[0.7rem] text-mocha">{cfg.idHint}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Field label={`1 · ${cfg.idLabel} *`}>
                <input
                  type="text"
                  inputMode={cfg.idKind === "tel" ? "numeric" : "text"}
                  value={active.acctId}
                  onChange={(e) => resetVerify(active.id, { acctId: e.target.value })}
                  disabled={active.verified}
                  className="gt-input"
                  placeholder={cfg.idPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <p className="mt-1.5 font-mono text-[0.7rem] text-mocha">{cfg.idHint}</p>
            </div>
            <div>
              <Field label={`${cfg.tagLabel} *`}>
                {cfg.tagOptions ? (
                  <select
                    value={active.acctTag}
                    onChange={(e) => resetVerify(active.id, { acctTag: e.target.value })}
                    disabled={active.verified}
                    className="gt-input"
                  >
                    <option value="">Select your server…</option>
                    {cfg.tagOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    inputMode={cfg.tagKind === "tel" ? "numeric" : "text"}
                    value={active.acctTag}
                    onChange={(e) => resetVerify(active.id, { acctTag: e.target.value })}
                    disabled={active.verified}
                    className="gt-input"
                    placeholder={cfg.tagPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              </Field>
            </div>
          </div>
        )}

        {/* 2 · VERIFY this account (required per account) */}
        <div>
          <p className="terminal-label">// 2 · prove it&rsquo;s your account</p>
          <p className="mt-2 text-sm text-cream-dim">
            Paste or upload a screenshot of your in-game profile clearly showing <strong>{cfg.proofWhat}</strong>
            {parsedActive ? (
              <>
                {" "}(<strong className="text-cream">{formatIdentity(active.gameSlug, parsedActive)}</strong>)
              </>
            ) : null}
            . We read it to make sure the {currency} land on the right account.
          </p>

          {cfg.showSample && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-bg/50 p-3">
              <button
                type="button"
                onClick={() => setSampleZoom(true)}
                title="Tap to enlarge the example"
                className="group relative shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-line-bright transition hover:border-amber/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/games/game-topups-sample-profile.svg" alt="Example: your game account menu showing your name and #tag" className="h-24 w-auto" />
                <span aria-hidden className="pointer-events-none absolute bottom-1 right-1 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wide text-cream-dim">
                  ⤢ enlarge
                </span>
              </button>
              <p className="font-mono text-[0.7rem] leading-relaxed text-mocha">
                <span className="text-cream-dim">Like this</span> — your name <span className="text-cream-dim">and #tag</span>{" "}
                must be clearly readable. <span className="text-cream-dim">Tap to enlarge.</span>
              </p>
            </div>
          )}

          {cfg.showSample && sampleZoom &&
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
                  alt="Example: your game account menu showing your name and #tag"
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[85vh] w-auto max-w-[92vw] cursor-default rounded-xl border border-line-bright shadow-2xl"
                />
              </div>,
              document.body,
            )}

          <ol className="mt-4 space-y-1.5 font-mono text-[0.72rem] leading-relaxed text-mocha">
            <li>
              <span className="text-amber">1.</span> Press <kbd className={kbdCls}>Print Screen</kbd>{" "}
              <span className="text-mocha/80">(or <kbd className={kbdCls}>Win</kbd>+<kbd className={kbdCls}>Shift</kbd>+<kbd className={kbdCls}>S</kbd> to snip)</span>
            </li>
            <li>
              <span className="text-amber">2.</span> Capture <span className="text-cream-dim">{cfg.proofWhat}</span> (your in-game account profile)
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
            {active.preview ? (
              <div className="relative mx-auto w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={active.preview} alt="Your screenshot preview" className="mx-auto max-h-56 rounded-lg" />
                {!active.verified && (
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
                      <button type="button" onClick={clearShot} title="Remove the screenshot" className="rounded-lg bg-rgb-r px-3.5 py-1.5 text-xs font-bold text-cream transition hover:brightness-110">
                        Yes, remove
                      </button>
                      <button type="button" onClick={() => setConfirmClear(false)} title="Keep the screenshot" className="rounded-lg border border-line-bright px-3.5 py-1.5 text-xs text-cream-dim transition hover:text-cream">
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
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={active.verified} title="Choose a screenshot file" className="key-cap disabled:opacity-50">
                <Upload className="h-4 w-4" />
                {active.preview ? "Choose a different screenshot" : "Choose screenshot"}
              </button>
            </div>
          </div>

          {active.verified ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-phosphor/40 bg-phosphor/10 p-3">
              <ShieldCheck className="h-4 w-4 text-phosphor" />
              <p className="font-mono text-xs text-phosphor">
                // account verified{active.needsReview ? " (pending a quick manual check)" : ""} — add your amounts below
              </p>
            </div>
          ) : (
            <>
              {active.verifyMsg && (
                <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber/40 bg-amber/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber" />
                  <p className="text-xs text-amber">
                    {active.verifyMsg}
                    {blockedLabel ? ` Try again after ${blockedLabel}.` : ""}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={verify}
                disabled={!parsedActive || !active.file || active.verifying || !!active.blockedUntil}
                title="Verify your account from the screenshot"
                className="key-cap mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
              >
                {active.verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {active.verifying ? "Checking…" : "Verify account"}
              </button>
            </>
          )}
        </div>

        {/* 3 · AMOUNTS (locked until this account is verified) */}
        <div>
          <p className="terminal-label">// 3 · add amounts (combine for any total)</p>
          {active.verified ? null : (
            <p className="mt-1.5 font-mono text-[0.7rem] text-amber/80">↑ verify your account first to unlock top-ups</p>
          )}
          <div className={`mt-3 grid gap-2 grid-cols-2 sm:grid-cols-3 ${active.verified ? "" : "opacity-50"}`}>
            {packages.map((p) => (
              <button
                key={p.sku}
                type="button"
                onClick={() => addPackage(p)}
                disabled={!active.verified}
                title={`Add ${p.label} for ${formatPHP(p.price)}`}
                className="flex flex-col rounded-lg border border-line-bright bg-bg p-3 text-left transition hover:border-amber/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center justify-between font-mono font-bold text-cream">
                  {p.vp.toLocaleString()} {currency}
                  <Plus className="h-3.5 w-3.5 text-amber" />
                </span>
                <span className="mt-1 font-mono text-xs text-amber">{formatPHP(p.price)}</span>
              </button>
            ))}
          </div>
          {active.verified && (
            <button
              type="button"
              onClick={addAnother}
              title="Top up another account in the same payment"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line-bright bg-bg px-3.5 py-2 font-mono text-xs text-cream-dim transition hover:border-amber/60 hover:text-cream"
            >
              <Plus className="h-3.5 w-3.5 text-amber" /> {games.length > 1 ? "Add another game / account" : "Add another account"}
            </button>
          )}
        </div>
      </div>

      {/* ── RIGHT: cart (grouped per account) + pay ─────────────────────── */}
      <div className="space-y-4 rounded-2xl border border-line-bright bg-bg-card p-6 md:p-8 lg:sticky lg:top-24 lg:self-start">
        <p className="terminal-label">// your order</p>
        {groupsWithLines.length === 0 ? (
          <p className="font-mono text-xs text-mocha">verify an account, then add amounts to begin</p>
        ) : (
          <div className="space-y-4">
            {groupsWithLines.map((g) => {
              const gi = identityOf(g);
              const gCfg = accountConfig(g.gameSlug);
              const gGame = games.find((x) => x.slug === g.gameSlug);
              const cur = gGame?.currency ?? "VP";
              const label = gi ? formatIdentity(g.gameSlug, gi) : "—";
              return (
                <div key={g.id} className="rounded-lg border border-line bg-bg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-display text-sm font-bold text-cream">
                      {gGame?.name ?? gCfg.idLabel} <span className="font-mono text-xs font-normal text-amber">· {label}</span>
                    </p>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          resetVerify(g.id); // re-enable the account/screenshot inputs; must re-verify before paying
                          setActiveId(g.id);
                        }}
                        title="Edit this account (you'll re-verify before paying)"
                        className="text-mocha hover:text-amber"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeGroup(g.id)} title="Remove this account from the order" className="text-mocha hover:text-rgb-r">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                  {!g.verified && (
                    <p className="mt-1 font-mono text-[0.65rem] text-rgb-r">⚠ re-verify this account before paying (you changed it)</p>
                  )}
                  <ul className="mt-2 space-y-1.5">
                    {g.lines.map((c, i) => (
                      <li key={`${c.sku}-${i}`} className="flex items-center justify-between rounded border border-line bg-bg-card px-2.5 py-1.5">
                        <span className="font-mono text-xs text-cream">{c.vp.toLocaleString()} {cur}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-amber">{formatPHP(c.price)}</span>
                          <button type="button" onClick={() => removeLineAt(g.id, i)} title="Remove this amount" className="text-mocha hover:text-rgb-r">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-line-bright pt-3">
          {totalSavings > 0 && (
            <>
              <div className="flex items-center justify-between font-mono text-sm">
                <span className="text-mocha">Original price</span>
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

        {/* Email (order-level — one receipt for the whole order) */}
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
          <p className="mt-1.5 font-mono text-[0.7rem] text-mocha">// your receipt &amp; order status are emailed here</p>
        </div>

        {needsReverify.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-rgb-r/40 bg-rgb-r/10 p-2.5 font-mono text-[0.7rem] text-rgb-r">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Re-verify the account(s) you edited before paying.
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-3 text-xs text-cream-dim">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber" />
          <span>
            My account IDs and amounts are correct. I understand that once delivered to the accounts I proved are mine,
            <strong className="text-cream"> there are no refunds</strong>.
          </span>
        </label>
        <p className="text-[0.7rem] leading-relaxed text-mocha">
          If we can&rsquo;t deliver (e.g. a temporary outage), your payment is{" "}
          <strong className="text-cream-dim">credited within 24 hours</strong> — or <strong className="text-cream-dim">fully refunded</strong>.
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
          disabled={!canPay || paying}
          title="Pay and place your order"
          className="key-cap key-cap-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
        >
          {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {paying ? "Routing to checkout…" : `Pay ${formatPHP(totalPrice)}`}
        </button>
        <p className="text-center font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
          {canPay ? "// gcash · card · secured by paymongo" : (
            <span className="flex items-center justify-center gap-2"><Check className="h-3 w-3" /> verify an account + add amounts to pay</span>
          )}
        </p>
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
    verify_expired: "One of your account verifications expired — please re-verify that account.",
    package_unavailable: "One of those amounts is no longer available — please re-add it.",
    invalid_amount: "Something's off with the total — please rebuild your order.",
    validation_failed: "Something's off with your order — please rebuild it.",
    checkout_failed: "Couldn't start checkout — please try again.",
    fulfilment_unavailable:
      "Top-ups are paused right now — our supplier is temporarily unreachable, so we can't take payment. You haven't been charged; please try again shortly.",
    rate_limited: "Too many attempts — please wait a moment.",
    bot_check_failed: "Couldn't verify you're human — please refresh and try again.",
    verification_unavailable: "Verification is busy right now — please try again in a little while.",
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
