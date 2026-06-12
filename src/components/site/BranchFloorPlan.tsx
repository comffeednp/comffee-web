"use client";

// Aerial floor plan for an internet-cafe branch — renders the layout the owner designed in the POS
// (branch_floorplan_elements), replacing the old 1–12 PC grid. Phase 3b: reservable spots animate with
// the live remaining time the POS pushes (live_status / live_ends_at). Ticks every second locally and
// polls the branch's live fields so a session a staffer just started shows up within seconds.
import { useEffect, useState, type ReactNode } from "react";
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

// Base footprint honouring the chosen shape (rect / round / L / C), used for counters + tables + decor.
function baseShape(el: FloorplanElement, fill: string, stroke: string, sw = 1.4) {
  const w = el.width, h = el.height;
  const common = { fill, stroke, strokeWidth: sw, filter: "url(#fpShadow)" };
  if (el.shape === "round") return <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} {...common} />;
  if (el.shape === "L") {
    const p = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 6], [-w / 6, -h / 6], [-w / 6, h / 2], [-w / 2, h / 2]].map((q) => q.join(",")).join(" ");
    return <polygon points={p} {...common} />;
  }
  if (el.shape === "C") {
    const t = Math.max(10, Math.min(w, h) * 0.3);
    const p = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2 + t], [-w / 2 + t, -h / 2 + t], [-w / 2 + t, h / 2 - t], [w / 2, h / 2 - t], [w / 2, h / 2], [-w / 2, h / 2]].map((q) => q.join(",")).join(" ");
    return <polygon points={p} {...common} />;
  }
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(8, Math.min(w, h) / 5)} {...common} />;
}

// A simple top-down chair (seat + backrest), rotated to face a table edge.
function Chair({ cx, cy, cw, ch, rot = 0, k }: { cx: number; cy: number; cw: number; ch: number; rot?: number; k: string }) {
  return (
    <g key={k} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
      <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} rx={cw * 0.22} fill="#3a2e24" stroke="#221911" strokeWidth="0.6" />
      <rect x={-cw / 2} y={ch / 2 - ch * 0.26} width={cw} height={ch * 0.26} rx={2} fill="#221911" />
    </g>
  );
}

// Detailed, realistic top-down furniture so customers can picture the space.
function Furniture({ el }: { el: FloorplanElement }) {
  const w = el.width, h = el.height;
  switch (el.type) {
    case "pc": {
      const deskH = h * 0.52, cs = Math.min(w * 0.55, h * 0.42);
      return (
        <g>
          <Chair k="c" cx={0} cy={h * 0.24} cw={cs} ch={h * 0.34} />
          <rect x={-w / 2} y={-h / 2} width={w} height={deskH} rx={3} fill="url(#fpWood)" stroke="#241813" strokeWidth="1.2" filter="url(#fpShadow)" />
          <rect x={-w * 0.3} y={-h / 2 + h * 0.05} width={w * 0.6} height={deskH * 0.4} rx={2} fill="#0c1612" stroke="#2da66a" strokeWidth="0.8" />
          <rect x={-w * 0.27} y={-h / 2 + h * 0.08} width={w * 0.54} height={deskH * 0.28} rx={1} fill="#143a2c" />
          <rect x={-w * 0.2} y={-h / 2 + deskH * 0.62} width={w * 0.4} height={deskH * 0.22} rx={2} fill="#2a2320" />
        </g>
      );
    }
    case "ps5": {
      return (
        <g>
          <Chair k="s" cx={0} cy={h * 0.28} cw={w * 0.6} ch={h * 0.3} />
          <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.46} rx={3} fill="#141018" stroke="#0a0810" strokeWidth="1.2" filter="url(#fpShadow)" />
          <rect x={-w * 0.34} y={-h / 2 + h * 0.06} width={w * 0.68} height={h * 0.3} rx={2} fill="#0c1612" stroke="#7CFFB2" strokeWidth="0.8" />
          <rect x={-w * 0.3} y={-h / 2 + h * 0.09} width={w * 0.6} height={h * 0.2} fill="#10302a" />
          <rect x={w * 0.2} y={h * 0.04} width={w * 0.2} height={h * 0.16} rx={2} fill="#e8e8ee" stroke="#9a9aa2" strokeWidth="0.6" />
        </g>
      );
    }
    case "table":
    case "long_table": {
      const chairs: ReactNode[] = [];
      const cw = Math.min(w, h) * 0.22, ch = Math.min(w, h) * 0.22;
      if (el.type === "table") {
        chairs.push(
          <Chair k="t" cx={0} cy={-h / 2 + ch * 0.4} cw={cw} ch={ch} rot={180} />,
          <Chair k="b" cx={0} cy={h / 2 - ch * 0.4} cw={cw} ch={ch} />,
          <Chair k="l" cx={-w / 2 + cw * 0.4} cy={0} cw={ch} ch={cw} rot={90} />,
          <Chair k="r" cx={w / 2 - cw * 0.4} cy={0} cw={ch} ch={cw} rot={270} />,
        );
      } else {
        const n = Math.max(2, Math.floor(w / 46));
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + (w / (n + 1)) * (i + 1);
          chairs.push(
            <Chair k={`tt${i}`} cx={x} cy={-h / 2 + ch * 0.4} cw={cw} ch={ch} rot={180} />,
            <Chair k={`bb${i}`} cx={x} cy={h / 2 - ch * 0.4} cw={cw} ch={ch} />,
          );
        }
      }
      return (
        <g>
          {chairs}
          {baseShape(el, "url(#fpWood)", "#241813")}
          {el.shape === "round"
            ? <ellipse rx={w * 0.36} ry={h * 0.36} fill="none" stroke="#8a6a45" strokeOpacity="0.35" />
            : <rect x={-w / 2 + 5} y={-h / 2 + 5} width={w - 10} height={h - 10} rx={4} fill="none" stroke="#8a6a45" strokeOpacity="0.3" />}
        </g>
      );
    }
    case "counter":
      return (
        <g>
          {baseShape(el, "url(#fpWood)", "#241813")}
          {baseShape({ ...el, width: w * 0.74, height: h * 0.74 }, "none", "#8a6a45", 1)}
        </g>
      );
    case "chair":
      return <Chair k="c" cx={0} cy={0} cw={w} ch={h} />;
    case "gaming_chair":
      return (
        <g filter="url(#fpShadow)">
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w * 0.25} fill="#341c1a" stroke="#1c0e0c" strokeWidth="1" />
          <rect x={-w * 0.4} y={-h / 2} width={w * 0.8} height={h * 0.24} rx={3} fill="#b04a44" />
          <rect x={-w * 0.34} y={-h * 0.05} width={w * 0.68} height={h * 0.42} rx={4} fill="#241412" />
        </g>
      );
    case "door":
    case "restroom_door": {
      const wood = el.type === "door" ? "#6b4f33" : "#3a5066";
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w * 0.12} height={h} fill="#2a2018" />
          <rect x={w / 2 - w * 0.12} y={-h / 2} width={w * 0.12} height={h} fill="#2a2018" />
          <rect x={-w / 2 + w * 0.12} y={-h * 0.2} width={w * 0.76} height={h * 0.4} rx={1} fill={wood} stroke="#1c140c" strokeWidth="0.8" filter="url(#fpShadow)" />
          <path d={`M ${-w / 2 + w * 0.12} ${h * 0.2} A ${w * 0.76} ${w * 0.76} 0 0 1 ${w / 2 - w * 0.12} ${-h * 0.55}`} fill="none" stroke="#8a7a68" strokeOpacity="0.4" strokeDasharray="3 3" strokeWidth="0.8" />
        </g>
      );
    }
    case "restroom":
      return (
        <g>
          {baseShape(el, "#1a242c", "#5e7d96")}
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#5e7d96" strokeOpacity="0.22" />
          <line x1={0} y1={-h / 2} x2={0} y2={h / 2} stroke="#5e7d96" strokeOpacity="0.22" />
        </g>
      );
    default: {
      if (el.shape === "rect") return baseShape(el, "#3a322a", "#241c16", 1.2); // wall
      return (
        <g filter="url(#fpShadow)">
          <ellipse rx={w / 2} ry={h / 2} fill="#16210f" stroke="#243018" />
          <circle r={Math.min(w, h) * 0.3} fill="#2e6b3a" />
          <circle r={Math.min(w, h) * 0.15} fill="#46a055" />
        </g>
      );
    }
  }
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

  const pad = 60;
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
        <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ aspectRatio: `${vbW} / ${vbH}`, maxHeight: "80vh" }} role="img" aria-label={`Floor plan of ${branchName}`}>
          <defs>
            <filter id="fpShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
            </filter>
            <filter id="fpGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#7CFFB2" floodOpacity="0.95" />
            </filter>
            <linearGradient id="fpWood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6e5235" />
              <stop offset="0.5" stopColor="#5a4129" />
              <stop offset="1" stopColor="#46311e" />
            </linearGradient>
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
                <Furniture el={el} />
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
