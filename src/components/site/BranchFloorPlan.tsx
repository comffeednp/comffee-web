"use client";

// Aerial floor plan for an internet-cafe branch — renders the exact layout the owner designed in the POS
// (branch_floorplan_elements). Shown as a third "Layout" view alongside the live grid + map. Furniture
// sits in a lit wooden room (fills the panel edge-to-edge, no letterboxing) so a customer can picture the
// real space. Live time-remaining is shown on each spot: PCs read PanCafe state from `stations` (same feed
// as the grid), while PS5 / tables read the POS floor-plan session fields (live_status / live_ends_at).
import { useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { PCStation } from "@/lib/pc-stations";

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

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// ── Live state ────────────────────────────────────────────────────────────────
// A spot is either free (reservable / vacant) or busy (a running session). PCs derive this from the live
// PanCafe station feed; PS5 / dining tables derive it from the POS floor-plan session the staff started.
type Live = { busy: boolean; over: boolean; text: string | null };

const FREE = "#7CFFB2";
const BUSY = "#ffb547";
const OVER = "#ff7a5c";

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

// Match a floor-plan PC element to its live PanCafe station. The POS labels PCs "PC 1".. and stores the
// seat number in pc_station_id; PanCafe stations come back as station_name "PC 1".. — match on the trailing
// number first (most robust), then on a normalised name.
function numOf(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function stationFor(el: FloorplanElement, stations: PCStation[]): PCStation | undefined {
  if (el.type !== "pc") return undefined;
  const n = el.pc_station_id ?? numOf(el.label);
  if (n != null) {
    const byNum = stations.find((s) => numOf(s.station_name) === n);
    if (byNum) return byNum;
  }
  const key = el.label.replace(/\s+/g, "").toLowerCase();
  return stations.find((s) => s.station_name.replace(/\s+/g, "").toLowerCase() === key);
}

function liveFor(el: FloorplanElement, now: number, stations: PCStation[]): Live | null {
  if (el.type === "pc") {
    const st = stationFor(el, stations);
    if (!st) return null; // PC not synced yet — show as static furniture
    if (!st.is_occupied) return { busy: false, over: false, text: null };
    if (st.current_session_ends_at) {
      const left = new Date(st.current_session_ends_at).getTime() - now;
      return { busy: true, over: left <= 0, text: left <= 0 ? "TIME UP" : fmt(left) };
    }
    if (st.is_member_session) return { busy: true, over: false, text: "MEMBER" };
    if (st.current_session_amount_php != null && Number(st.current_session_amount_php) > 0)
      return { busy: true, over: false, text: `₱${Number(st.current_session_amount_php).toFixed(0)}` };
    return { busy: true, over: false, text: "IN USE" };
  }
  // PS5 / dining table / anything the POS floor-plan timer drives.
  if (el.reservable && el.live_status === "active" && el.live_ends_at) {
    const left = new Date(el.live_ends_at).getTime() - now;
    return { busy: true, over: left <= 0, text: left <= 0 ? "TIME UP" : fmt(left) };
  }
  return null;
}

// ── Furniture ──────────────────────────────────────────────────────────────────
// Footprint honouring the chosen shape (rect / round / L / C), used for counters + tables.
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

// Simple top-down dining chair (seat + backrest), faces a table edge via rot.
function Chair({ cx, cy, cw, ch, rot = 0 }: { cx: number; cy: number; cw: number; ch: number; rot?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`}>
      <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} rx={cw * 0.22} fill="#3a2e24" stroke="#1c1410" strokeWidth="0.6" />
      <rect x={-cw / 2} y={ch / 2 - ch * 0.28} width={cw} height={ch * 0.28} rx={2} fill="#211711" />
    </g>
  );
}

// Top-down racing/gaming chair. Orientation: the SEAT cushion is toward the desk (-y) and the backrest +
// headrest are behind the player (+y), so a chair placed below a PC desk reads correctly (Claude-design
// furniture pass, 2026-06-13 — corrects the earlier flipped orientation).
function GamingChair({ cx, cy, w, h, rot = 0, accent = "#c0504a" }: { cx: number; cy: number; w: number; h: number; rot?: number; accent?: string }) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`} filter="url(#fpShadow)">
      {/* base / wheel spread */}
      <ellipse cx={0} cy={h * 0.04} rx={w * 0.5} ry={h * 0.46} fill="#140d0b" opacity="0.85" />
      {/* backrest shell (behind the player, +y) */}
      <rect x={-w * 0.46} y={h * 0.02} width={w * 0.92} height={h * 0.46} rx={w * 0.2} fill="#241715" stroke="#0d0807" strokeWidth="0.8" />
      {/* coloured side bolsters */}
      <rect x={-w * 0.46} y={h * 0.05} width={w * 0.16} height={h * 0.4} rx={w * 0.07} fill={accent} />
      <rect x={w * 0.30} y={h * 0.05} width={w * 0.16} height={h * 0.4} rx={w * 0.07} fill={accent} />
      {/* headrest */}
      <rect x={-w * 0.17} y={h * 0.4} width={w * 0.34} height={h * 0.16} rx={w * 0.06} fill={accent} stroke="#0d0807" strokeWidth="0.6" />
      {/* seat cushion (toward the desk, -y) */}
      <rect x={-w * 0.36} y={-h * 0.42} width={w * 0.72} height={h * 0.5} rx={w * 0.16} fill="#2c1d19" />
      <rect x={-w * 0.24} y={-h * 0.34} width={w * 0.48} height={h * 0.34} rx={w * 0.1} fill="#3a2620" />
    </g>
  );
}

// Glowing top-down screen (monitor / TV). `accent` lets it tint green when free / amber when in use.
function Screen({ x, y, w, h, accent = "#2da66a" }: { x: number; y: number; w: number; h: number; accent?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2.5} fill="#0a1410" stroke={accent} strokeWidth="1.1" filter="url(#fpScreen)" />
      <rect x={x + w * 0.08} y={y + h * 0.16} width={w * 0.84} height={h * 0.52} rx={1.5} fill={accent} opacity="0.28" />
      <rect x={x + w * 0.08} y={y + h * 0.16} width={w * 0.4} height={h * 0.1} rx={1} fill={accent} opacity="0.5" />
    </g>
  );
}

function Furniture({ el }: { el: FloorplanElement }) {
  const w = el.width, h = el.height;
  switch (el.type) {
    case "pc": {
      const dD = h * 0.5, top = -h / 2, gc = Math.min(w * 0.82, h * 0.5);
      return (
        <g>
          <GamingChair cx={0} cy={h * 0.26} w={gc} h={h * 0.42} />
          {/* desk */}
          <rect x={-w / 2} y={top} width={w} height={dD} rx={3} fill="url(#fpWood)" stroke="#241813" strokeWidth="1.2" filter="url(#fpShadow)" />
          {/* monitor stand + glowing screen */}
          <rect x={-w * 0.04} y={top + dD * 0.5} width={w * 0.08} height={dD * 0.22} fill="#2da66a" opacity="0.5" />
          <Screen x={-w * 0.3} y={top + dD * 0.1} w={w * 0.6} h={dD * 0.5} />
          {/* keyboard */}
          <rect x={-w * 0.22} y={top + dD * 0.7} width={w * 0.44} height={dD * 0.18} rx={2} fill="#2a2320" stroke="#161210" strokeWidth="0.5" />
        </g>
      );
    }
    case "ps5": {
      const dD = h * 0.44, top = -h / 2;
      return (
        <g>
          <GamingChair cx={0} cy={h * 0.3} w={w * 0.78} h={h * 0.38} accent="#5a4cc0" />
          {/* media unit */}
          <rect x={-w / 2} y={top} width={w} height={dD} rx={3} fill="#141018" stroke="#0a0810" strokeWidth="1.2" filter="url(#fpShadow)" />
          {/* TV */}
          <Screen x={-w * 0.36} y={top + dD * 0.12} w={w * 0.72} h={dD * 0.6} accent="#7CFFB2" />
          {/* console tower */}
          <rect x={w * 0.22} y={top + dD * 0.5} width={w * 0.18} height={dD * 0.5} rx={2} fill="#eef0f4" stroke="#9a9aa2" strokeWidth="0.6" />
          <line x1={w * 0.31} y1={top + dD * 0.5} x2={w * 0.31} y2={top + dD} stroke="#3a4cc0" strokeWidth="1.2" />
        </g>
      );
    }
    case "table":
    case "long_table": {
      const chairs: ReactNode[] = [];
      const cw = Math.min(w, h) * 0.22, ch = Math.min(w, h) * 0.22;
      if (el.type === "table") {
        chairs.push(
          <Chair key="t" cx={0} cy={-h / 2 + ch * 0.4} cw={cw} ch={ch} rot={180} />,
          <Chair key="b" cx={0} cy={h / 2 - ch * 0.4} cw={cw} ch={ch} />,
          <Chair key="l" cx={-w / 2 + cw * 0.4} cy={0} cw={ch} ch={cw} rot={90} />,
          <Chair key="r" cx={w / 2 - cw * 0.4} cy={0} cw={ch} ch={cw} rot={270} />,
        );
      } else {
        const n = Math.max(2, Math.floor(w / 46));
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + (w / (n + 1)) * (i + 1);
          chairs.push(
            <Chair key={`tt${i}`} cx={x} cy={-h / 2 + ch * 0.4} cw={cw} ch={ch} rot={180} />,
            <Chair key={`bb${i}`} cx={x} cy={h / 2 - ch * 0.4} cw={cw} ch={ch} />,
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
      return <Chair cx={0} cy={0} cw={w} ch={h} />;
    case "gaming_chair":
      return <GamingChair cx={0} cy={0} w={w} h={h} />;
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
      if (el.shape === "rect") return baseShape(el, "#3a322a", "#241c16", 1.2); // wall segment
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
  stations = [],
}: {
  elements: FloorplanElement[];
  branchName: string;
  branchId: string;
  stations?: PCStation[];
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

  // Poll the branch's live fields so a PS5/table session a staffer just started appears within seconds.
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

  // ── Bounds → room → viewBox. Rotated AABB per element keeps tall PCs from over-padding the width.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const r = (el.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
    const halfW = (el.width * cos + el.height * sin) / 2;
    const halfH = (el.width * sin + el.height * cos) / 2;
    minX = Math.min(minX, el.x - halfW); maxX = Math.max(maxX, el.x + halfW);
    minY = Math.min(minY, el.y - halfH); maxY = Math.max(maxY, el.y + halfH);
  }
  const ROOM = 30; // walking margin between furniture and the wall
  const OUT = 14;  // thin dark frame outside the wall
  const roomX = minX - ROOM, roomY = minY - ROOM;
  const roomW = maxX - minX + ROOM * 2, roomH = maxY - minY + ROOM * 2;
  const vbX = roomX - OUT, vbY = roomY - OUT;
  const vbW = roomW + OUT * 2, vbH = roomH + OUT * 2;

  const sorted = [...elements].sort((a, b) => a.z_index - b.z_index);
  const liveMap = new Map(elements.map((e) => [e.id, liveFor(e, now, stations)] as const));
  const busyCount = [...liveMap.values()].filter((l) => l?.busy).length;
  const showLabel = (t: string) => t === "pc" || t === "ps5";

  return (
    <div className="w-full">
      <p className="mt-4 text-cream-dim max-w-2xl">
        The real layout of {branchName} from above. A glowing dot marks what you can reserve
        {busyCount > 0 ? `, and ${busyCount} spot${busyCount > 1 ? "s are" : " is"} in use right now with the time left shown.` : "."}
      </p>

      <div className="mt-6 rounded-2xl border border-line-bright bg-[#0b0907] p-2 md:p-3 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_-24px_rgba(0,0,0,0.8)]">
        <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: `${vbW} / ${vbH}` }}>
          <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" role="img" aria-label={`Floor plan of ${branchName}`}>
            <defs>
              <filter id="fpShadow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
              </filter>
              <filter id="fpScreen" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#2da66a" floodOpacity="0.6" />
              </filter>
              <filter id="fpGlow" x="-120%" y="-120%" width="340%" height="340%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#7CFFB2" floodOpacity="0.95" />
              </filter>
              <linearGradient id="fpWood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#6e5235" />
                <stop offset="0.5" stopColor="#5a4129" />
                <stop offset="1" stopColor="#46311e" />
              </linearGradient>
              {/* warm, softly-lit wooden floor */}
              <radialGradient id="fpFloor" cx="0.5" cy="0.42" r="0.75">
                <stop offset="0" stopColor="#2b2018" />
                <stop offset="0.6" stopColor="#1f1610" />
                <stop offset="1" stopColor="#140d09" />
              </radialGradient>
              <radialGradient id="fpVignette" cx="0.5" cy="0.5" r="0.72">
                <stop offset="0.55" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity="0.45" />
              </radialGradient>
              {/* plank seams */}
              <pattern id="fpPlank" width={Math.max(40, roomW)} height="30" patternUnits="userSpaceOnUse" x={roomX} y={roomY}>
                <line x1="0" y1="0" x2={Math.max(40, roomW)} y2="0" stroke="#000" strokeOpacity="0.22" strokeWidth="1.4" />
                <line x1="0" y1="1.4" x2={Math.max(40, roomW)} y2="1.4" stroke="#fff" strokeOpacity="0.03" strokeWidth="1" />
              </pattern>
            </defs>

            {/* dark frame */}
            <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#0b0907" />
            {/* room: floor + planks + walls + vignette */}
            <rect x={roomX} y={roomY} width={roomW} height={roomH} rx={14} fill="url(#fpFloor)" />
            <rect x={roomX} y={roomY} width={roomW} height={roomH} rx={14} fill="url(#fpPlank)" />
            <rect x={roomX + 3} y={roomY + 3} width={roomW - 6} height={roomH - 6} rx={12} fill="none" stroke="#0d0907" strokeWidth="1" strokeOpacity="0.6" />
            <rect x={roomX} y={roomY} width={roomW} height={roomH} rx={14} fill="none" stroke="#3a2c20" strokeWidth="4" />
            <rect x={roomX + 6} y={roomY + 6} width={roomW - 12} height={roomH - 12} rx={10} fill="none" stroke="#6b4f33" strokeWidth="1" strokeOpacity="0.3" />

            {sorted.map((el) => {
              const live = liveMap.get(el.id) ?? null;
              const bookable = canBook(el) && !live?.busy;
              const ringColor = live?.busy ? (live.over ? OVER : BUSY) : null;
              const fontSize = Math.max(7, Math.min(11, Math.min(el.width, el.height) / 3.6));
              const half = Math.min(el.width, el.height);
              return (
                <g
                  key={el.id}
                  transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}
                  onClick={bookable ? () => openBook(el) : undefined}
                  style={{ cursor: bookable ? "pointer" : "default" }}
                >
                  <Furniture el={el} />

                  {/* live status ring */}
                  {ringColor && (
                    el.shape === "round"
                      ? <ellipse rx={el.width / 2 + 2} ry={el.height / 2 + 2} fill="none" stroke={ringColor} strokeWidth={2.5} />
                      : <rect x={-el.width / 2 - 2} y={-el.height / 2 - 2} width={el.width + 4} height={el.height + 4} rx={Math.min(10, half / 4)} fill="none" stroke={ringColor} strokeWidth={2.5} />
                  )}

                  {/* label — only PCs + PS5 carry a name; furniture stays clean */}
                  {showLabel(el.type) && el.label && (
                    <text
                      x={0}
                      y={-el.height / 2 + fontSize + 2}
                      textAnchor="middle"
                      transform={`rotate(${-el.rotation})`}
                      fontSize={fontSize}
                      fontWeight={700}
                      fill="#f4ecdf"
                      fontFamily={MONO}
                      letterSpacing="0.5"
                      stroke="#000"
                      strokeWidth={2.4}
                      strokeOpacity={0.55}
                      paintOrder="stroke"
                      style={{ pointerEvents: "none" }}
                    >
                      {el.label.toUpperCase()}
                    </text>
                  )}

                  {/* time remaining */}
                  {live?.busy && live.text && (
                    <text
                      x={0}
                      y={el.height / 2 - 4}
                      textAnchor="middle"
                      transform={`rotate(${-el.rotation})`}
                      fontSize={Math.max(8, fontSize)}
                      fontWeight={700}
                      fill={live.over ? OVER : BUSY}
                      fontFamily={MONO}
                      stroke="#000"
                      strokeWidth={2.4}
                      strokeOpacity={0.6}
                      paintOrder="stroke"
                      style={{ pointerEvents: "none" }}
                    >
                      {live.text}
                    </text>
                  )}

                  {/* availability dot — bookable spot OR a free PC */}
                  {(bookable || (el.type === "pc" && live && !live.busy)) && (
                    <circle className="animate-pulse" cx={el.width / 2 - 5} cy={-el.height / 2 + 5} r={3} fill={FREE} filter="url(#fpGlow)" />
                  )}
                </g>
              );
            })}

            <rect x={roomX} y={roomY} width={roomW} height={roomH} rx={14} fill="url(#fpVignette)" pointerEvents="none" />
          </svg>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        {(elements.some(canBook) || stations.some((s) => !s.is_occupied)) && (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-phosphor shadow-[0_0_6px_var(--color-phosphor)]" />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">Available — tap a spot to reserve</span>
          </div>
        )}
        {busyCount > 0 && (
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
              <button className="flex-1 rounded-lg border border-line py-2 text-cream-dim" onClick={() => setBook(null)} disabled={bBusy} title="Cancel reservation">Cancel</button>
              <button className="flex-1 rounded-lg bg-phosphor py-2 font-semibold text-bg disabled:opacity-60" onClick={submitBook} disabled={bBusy} title="Confirm reservation">
                {bBusy ? "…" : book.billing_mode === "time_rate" ? "Pay & reserve" : "Reserve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
