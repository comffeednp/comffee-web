"use client";

// Aerial floor plan for an internet-cafe branch — renders the layout the owner designed in the POS
// (branch_floorplan_elements), replacing the old 1–12 PC grid. Phase 3b: reservable spots animate with
// the live remaining time the POS pushes (live_status / live_ends_at). Ticks every second locally and
// polls the branch's live fields so a session a staffer just started shows up within seconds.
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export interface FloorplanElement {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  shape: string;
  reservable: boolean;
  billing_mode: string;
  rate_per_hour: number;
  min_order_amount: number;
  capacity: number;
  pc_station_id: number | null;
  accept_online?: boolean | null;
  accept_advance?: boolean | null;
  live_status?: string | null;
  live_ends_at?: string | null;
}

// On-brand dark palette (espresso surfaces + phosphor/mocha accents) — matches the site's terminal look
// instead of flat paint colors. Muted dark fills, clear strokes for definition, cream text.
const STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
  pc:           { fill: "#18241d", stroke: "#2da66a", text: "#dfeee6" },
  ps5:          { fill: "#221b2b", stroke: "#7CFFB2", text: "#e7e0f0" },
  table:        { fill: "#2e231b", stroke: "#8a7a68", text: "#f4ecdf" },
  long_table:   { fill: "#2e231b", stroke: "#8a7a68", text: "#f4ecdf" },
  chair:        { fill: "#241e18", stroke: "#5a4f43", text: "#c9bfae" },
  gaming_chair: { fill: "#341c1a", stroke: "#b04a44", text: "#f0d8d4" },
  counter:      { fill: "#262019", stroke: "#8a7a68", text: "#c9bfae" },
  decor:        { fill: "#1a261a", stroke: "#2da66a", text: "#bcd6c2" },
  door:         { fill: "#2a2016", stroke: "#8a7a68", text: "#c9bfae" },
  restroom:     { fill: "#1a242c", stroke: "#5e7d96", text: "#bcd0dc" },
  restroom_door:{ fill: "#1a242c", stroke: "#5e7d96", text: "#bcd0dc" },
};

function liveOf(el: FloorplanElement, now: number) {
  if (!el.reservable || el.live_status !== "active" || !el.live_ends_at) return null;
  const left = new Date(el.live_ends_at).getTime() - now;
  if (left <= 0) return { over: true, text: "TIME UP", color: "#ff7a5c" };
  const t = Math.round(left / 1000);
  return { over: false, text: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, color: "#ffb547" };
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function ShapeEl({ el }: { el: FloorplanElement }) {
  const s = STYLE[el.type] ?? STYLE.decor;
  const w = el.width, h = el.height;
  const common = { fill: s.fill, stroke: s.stroke, strokeWidth: 1.5, filter: "url(#fpShadow)" };
  if (el.shape === "round") return <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} {...common} />;
  if (el.shape === "L") {
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 6], [-w / 6, -h / 6], [-w / 6, h / 2], [-w / 2, h / 2]].map((p) => p.join(",")).join(" ");
    return <polygon points={pts} {...common} />;
  }
  if (el.shape === "C") {
    const t = Math.max(10, Math.min(w, h) * 0.3);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2 + t], [-w / 2 + t, -h / 2 + t], [-w / 2 + t, h / 2 - t], [w / 2, h / 2 - t], [w / 2, h / 2], [-w / 2, h / 2]].map((p) => p.join(",")).join(" ");
    return <polygon points={pts} {...common} />;
  }
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(10, Math.min(w, h) / 4)} {...common} />;
}

export default function BranchFloorPlan({
  elements: initial,
  branchName,
  branchId,
}: {
  elements: FloorplanElement[];
  branchName: string;
  branchId: string;
}) {
  const [elements, setElements] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  // Online reservation modal state.
  const [book, setBook] = useState<FloorplanElement | null>(null);
  const [bName, setBName] = useState("");
  const [bContact, setBContact] = useState("");
  const [bStart, setBStart] = useState("");
  const [bDur, setBDur] = useState(60);
  const [bBusy, setBBusy] = useState(false);
  const [bMsg, setBMsg] = useState<string | null>(null);

  const canBook = (el: FloorplanElement) => !!(el.reservable && el.accept_online);
  function openBook(el: FloorplanElement) {
    setBook(el); setBName(""); setBContact(""); setBStart(""); setBDur(60); setBMsg(null);
  }
  function bookErr(code: string) {
    return ({
      time_unavailable: "That time is already taken on this spot.",
      advance_not_allowed: "This spot only takes walk-in reservations, not advance ones.",
      online_payment_unavailable: "Online payment isn't set up for this cafe yet.",
      spot_not_reservable: "That spot can't be reserved online.",
      bad_start_time: "Pick a valid start time.",
      validation_failed: "Please check the details and try again.",
    } as Record<string, string>)[code] || "Could not reserve. Please try again.";
  }
  async function submitBook() {
    if (!book) return;
    if (bName.trim().length < 1) { setBMsg("Enter your name."); return; }
    const startIso = bStart ? new Date(bStart).toISOString() : new Date(Date.now() + 60_000).toISOString();
    setBBusy(true); setBMsg(null);
    try {
      const res = await fetch("/api/floorplan-reservations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          elementIdx: book.z_index,
          customerName: bName.trim(),
          customerContact: bContact.trim() || undefined,
          startAt: startIso,
          durationMin: bDur,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setBMsg(bookErr(j.error)); setBBusy(false); return; }
      if (j.checkoutUrl) { window.location.href = j.checkoutUrl as string; return; }
      setBMsg(`✓ Reserved! Your code is ${j.reservationCode}.${j.minOrder ? ` A minimum order of ₱${j.minOrder} applies at the cafe.` : ""}`);
    } catch { setBMsg("Could not reserve — check your connection."); }
    setBBusy(false);
  }

  // Tick the countdown every second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the branch's live fields so a session a staffer just started appears within seconds.
  useEffect(() => {
    let stop = false;
    let supabase: ReturnType<typeof getSupabaseBrowser>;
    try { supabase = getSupabaseBrowser(); } catch { return; }
    const poll = async () => {
      const { data } = await supabase
        .from("branch_floorplan_elements")
        .select("id, live_status, live_ends_at")
        .eq("branch_id", branchId);
      if (stop || !data) return;
      const rows = data as Array<{ id: string; live_status: string | null; live_ends_at: string | null }>;
      const map = new Map(rows.map((d) => [d.id, d] as const));
      setElements((prev) => prev.map((e) => {
        const u = map.get(e.id);
        return u ? { ...e, live_status: u.live_status, live_ends_at: u.live_ends_at } : e;
      }));
    };
    const iv = setInterval(poll, 12000);
    return () => { stop = true; clearInterval(iv); };
  }, [branchId]);

  if (!elements || elements.length === 0) return null;

  const pad = 40;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const hw = Math.max(el.width, el.height) / 2;
    minX = Math.min(minX, el.x - hw); minY = Math.min(minY, el.y - hw);
    maxX = Math.max(maxX, el.x + hw); maxY = Math.max(maxY, el.y + hw);
  }
  const vbX = minX - pad, vbY = minY - pad;
  const vbW = Math.max(200, maxX - minX + pad * 2), vbH = Math.max(160, maxY - minY + pad * 2);
  const sorted = [...elements].sort((a, b) => a.z_index - b.z_index);
  const activeCount = elements.filter((e) => liveOf(e, now)).length;

  return (
    <section className="container-edge py-20 md:py-28" aria-label="Cafe floor plan">
      <p className="terminal-label">floor.plan</p>
      <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream">Find your spot</h2>
      <p className="mt-4 text-cream-dim max-w-2xl">
        The real layout of {branchName}. A glowing dot marks what you can reserve
        {activeCount > 0 ? `, and ${activeCount} spot${activeCount > 1 ? "s are" : " is"} in use right now with the time left shown.` : "."}
      </p>

      <div className="mt-10 rounded-2xl border border-line-bright bg-bg-card p-3 md:p-5 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="w-full h-auto" style={{ maxHeight: 620 }} role="img" aria-label={`Floor plan of ${branchName}`}>
          <defs>
            <filter id="fpShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
            </filter>
            <filter id="fpGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#7CFFB2" floodOpacity="0.95" />
            </filter>
            <pattern id="fpGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#fpGrid)" />
          {sorted.map((el) => {
            const s = STYLE[el.type] ?? STYLE.decor;
            const live = liveOf(el, now);
            const fontSize = Math.max(8, Math.min(12, el.height / 3.4));
            return (
              <g
                key={el.id}
                transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}
                onClick={canBook(el) ? () => openBook(el) : undefined}
                style={{ cursor: canBook(el) ? "pointer" : "default" }}
              >
                <ShapeEl el={el} />
                {live && (
                  <rect x={-el.width / 2} y={-el.height / 2} width={el.width} height={el.height} rx={Math.min(10, Math.min(el.width, el.height) / 4)} fill="none" stroke={live.color} strokeWidth={2.5} />
                )}
                {el.label && (
                  <text x={0} y={live ? -2 : fontSize / 3} textAnchor="middle" fontSize={fontSize} fontWeight={700} fill={s.text} fontFamily={MONO} letterSpacing="0.5" style={{ pointerEvents: "none" }}>
                    {el.label.toUpperCase()}
                  </text>
                )}
                {live && (
                  <text x={0} y={el.height / 2 - 4} textAnchor="middle" fontSize={Math.max(9, Math.min(12, el.height / 3.4))} fontWeight={700} fill={live.color} fontFamily={MONO} style={{ pointerEvents: "none" }}>
                    {live.text}
                  </text>
                )}
                {!live && el.reservable && (
                  <circle className="animate-pulse" cx={el.width / 2 - 6} cy={-el.height / 2 + 6} r={3} fill="#7CFFB2" filter="url(#fpGlow)" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        {elements.some(canBook) && (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-phosphor shadow-[0_0_6px_var(--color-phosphor)]" />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">Reservable — tap to book</span>
          </div>
        )}
        {activeCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber shadow-[0_0_6px_var(--color-amber)]" />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">In use — time left shown</span>
          </div>
        )}
      </div>

      {book && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !bBusy && setBook(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-bg-card p-6 border border-line" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl font-bold text-cream">Reserve {book.label || "spot"}</h3>
            <p className="mt-1 text-sm text-cream-dim">
              {book.billing_mode === "time_rate"
                ? `₱${book.rate_per_hour}/hour — pay online to confirm.`
                : `Minimum order ₱${book.min_order_amount} at the cafe.`}
            </p>
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-cream" placeholder="Your name" value={bName} onChange={(e) => setBName(e.target.value)} maxLength={120} />
              <input className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-cream" placeholder="Phone or email (optional)" value={bContact} onChange={(e) => setBContact(e.target.value)} maxLength={60} />
              {book.accept_advance ? (
                <label className="block text-sm text-cream-dim">
                  Start time
                  <input type="datetime-local" className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-cream" value={bStart} onChange={(e) => setBStart(e.target.value)} />
                </label>
              ) : (
                <p className="text-xs text-cream-dim">Starts now (walk-in).</p>
              )}
              <label className="block text-sm text-cream-dim">
                Minutes
                <input type="number" min={15} step={15} className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-cream" value={bDur} onChange={(e) => setBDur(Math.max(15, parseInt(e.target.value, 10) || 60))} />
              </label>
              {book.billing_mode === "time_rate" && (
                <p className="text-sm font-semibold text-cream">Total: ₱{(Math.round((book.rate_per_hour || 0) * (bDur / 60) * 100) / 100).toLocaleString()}</p>
              )}
              {bMsg && <p className="text-sm text-amber">{bMsg}</p>}
            </div>
            <div className="mt-5 flex gap-2">
              <button className="flex-1 rounded-lg border border-line py-2 text-cream-dim" onClick={() => setBook(null)} disabled={bBusy} title="Cancel">Cancel</button>
              <button className="flex-1 rounded-lg bg-phosphor py-2 font-semibold text-bg disabled:opacity-60" onClick={submitBook} disabled={bBusy} title="Confirm reservation">
                {bBusy ? "…" : book.billing_mode === "time_rate" ? "Pay & reserve" : "Reserve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
