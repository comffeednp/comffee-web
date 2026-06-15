"use client";

// Numbered bookable spots (dining tables + PS5) for a cafe branch — shown as a simple numbered tile grid
// in the SAME style as the live PC 1–12 board (owner 2026-06-13: dropped the visual aerial floor plan in
// favour of plain numbering). Each spot tiles as "Table 1" / "PS5 1", shows live availability + remaining
// time the POS pushes (live_status / live_ends_at).
//
// Reservation flow (owner 2026-06-13): pick a DATE + START TIME from dropdowns (minutes allowed, not a
// rigid hourly grid) — both REQUIRED, so Pay is blocked until a real slot is chosen (fixes "no time
// selected still paid"). The modal shows the spot's already-RESERVED times for the chosen day and a clear
// arrival policy. PS5 prepays through the branch's own PayMongo (manager's secret key); dining tables
// pledge a minimum order. The DIY GCash QR stays a COUNTER-only payment — it is never used here.
import { useEffect, useState } from "react";
import { Gamepad2, UtensilsCrossed, Power, Clock } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export interface FloorplanElement {
  id: string;
  type: string;
  label: string;
  z_index: number;
  reservable: boolean;
  billing_mode: string;
  rate_per_hour: number;
  min_order_amount: number;
  capacity: number;
  accept_online?: boolean | null;
  accept_advance?: boolean | null;
  included_controllers?: number | null;
  extra_controller_price?: number | null;
  max_controllers?: number | null;
  live_status?: string | null;
  live_ends_at?: string | null;
}

const DINING = new Set(["table", "long_table"]);
// A PS5 with a controller cap > 1 offers a controller picker.
const isConsole = (el: FloorplanElement) => el.type === "ps5" && (Number(el.max_controllers) || 0) > 1;
// Base price (per the element's billing) + flat surcharge for controllers beyond the included count.
function spotPrice(el: FloorplanElement, durMin: number, controllers: number) {
  const base = el.billing_mode === "time_rate" ? (Number(el.rate_per_hour) || 0) * (durMin / 60) : 0;
  const inc = Number(el.included_controllers) || 0;
  const extra = Number(el.extra_controller_price) || 0;
  const c = Math.max(0, controllers || 0);
  return Math.round((base + Math.max(0, c - inc) * extra) * 100) / 100;
}
const DUR_OPTIONS = [
  { m: 60, l: "1 hour" },
  { m: 90, l: "1 hour 30 minutes" },
  { m: 120, l: "2 hours" },
  { m: 180, l: "3 hours" },
  { m: 240, l: "4 hours" },
];

function pad2(n: number) { return String(n).padStart(2, "0"); }
function fmtClock(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad2(m)} ${ap}`;
}
function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return "ending soon";
}
// Next 7 calendar days as { value: "YYYY-MM-DD", label = "Sat, Jun 14 (Today)" }. The label always shows
// the real date and tags only the first two with (Today)/(Tomorrow) — clearer than a bare "Today".
// "Today" is dropped once its last bookable slot (23:45) has passed, so booking past midnight forces
// Tomorrow. Computed client-side only (the modal never renders on the server) → no hydration mismatch.
function dayOptions(nowMs: number): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const base = new Date(nowMs);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    if (i === 0 && nowMs > new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 45).getTime()) continue;
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const dl = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    out.push({ value, label: i === 0 ? `${dl} (Today)` : i === 1 ? `${dl} (Tomorrow)` : dl });
  }
  return out;
}
// 15-minute start times for the chosen day. For TODAY, only slots still in the future are offered
// (11:30 PM → just 11:45 PM); future days show the full 24h. value "HH:MM", label "h:mm AM/PM".
function timeOptions(dateStr: string, nowMs: number): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    const h = Math.floor(mins / 60), m = mins % 60;
    const value = `${pad2(h)}:${pad2(m)}`;
    if (dateStr && !(new Date(`${dateStr}T${value}:00`).getTime() > nowMs)) continue;
    out.push({ value, label: fmtClock(new Date(2000, 0, 1, h, m)) });
  }
  return out;
}

type Range = { start: number; ends: number };

export default function BookableSpots({
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

  const [book, setBook] = useState<FloorplanElement | null>(null);
  const [bName, setBName] = useState("");
  const [bContact, setBContact] = useState("");
  const [bDate, setBDate] = useState("");
  const [bTime, setBTime] = useState("");
  const [bDur, setBDur] = useState(60);
  const [bCtrl, setBCtrl] = useState(1);
  const [bBusy, setBBusy] = useState(false);
  const [bMsg, setBMsg] = useState<string | null>(null);
  const [reserved, setReserved] = useState<Range[]>([]);
  // "Now" captured when the modal opens — drives which day/time options are still bookable. Stable
  // through the per-second tick so an open dropdown doesn't churn; live `now` still gates the Pay button.
  const [bNow, setBNow] = useState(() => Date.now());

  const canBook = (el: FloorplanElement) => !!(el.reservable && el.accept_online);

  async function loadAvailability(el: FloorplanElement) {
    setReserved([]);
    try {
      const r = await fetch(`/api/floorplan-reservations/availability?branchId=${encodeURIComponent(branchId)}&elementIdx=${el.z_index}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && Array.isArray(j.reserved)) {
        setReserved(j.reserved.map((x: { start: string; ends: string }) => ({ start: Date.parse(x.start), ends: Date.parse(x.ends) })).filter((x: Range) => x.ends > x.start));
      }
    } catch { /* show form anyway; the server still rejects a clash */ }
  }
  function openBook(el: FloorplanElement) {
    setBook(el); setBName(""); setBContact(""); setBDate(""); setBTime(""); setBDur(60); setBMsg(null);
    setBCtrl(Math.max(1, Number(el.included_controllers) || 1));
    setBNow(Date.now());
    loadAvailability(el);
  }

  // Selected window from the date + time dropdowns (local time). null until BOTH are chosen.
  const startDate = bDate && bTime ? new Date(`${bDate}T${bTime}:00`) : null;
  const startMs = startDate && !isNaN(startDate.getTime()) ? startDate.getTime() : null;
  const endMs = startMs != null ? startMs + bDur * 60000 : null;
  const isPast = startMs != null && startMs < now - 2 * 60000;
  const clashes = startMs != null && endMs != null && reserved.some((r) => !(endMs <= r.start || startMs >= r.ends));
  const nameOk = bName.trim().length >= 1;
  const canPay = !!book && nameOk && startMs != null && !isPast && !clashes;
  // Reserved ranges that fall on the chosen day (for the "already reserved" list).
  const dayReserved = bDate
    ? reserved.filter((r) => {
        const d = new Date(r.start);
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` === bDate;
      })
    : [];

  function bookErr(code: string) {
    return ({
      time_unavailable: "That time was just taken — pick another.",
      advance_not_allowed: "This spot only takes walk-in reservations.",
      online_payment_unavailable: "Online payment isn't set up for this cafe yet.",
      spot_not_reservable: "That spot can't be reserved online.",
      bad_start_time: "Pick a valid start time.",
      validation_failed: "Please check the details and try again.",
    } as Record<string, string>)[code] || "Could not reserve. Please try again.";
  }
  async function submitBook() {
    if (!book || !canPay || startMs == null) return;
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
          startAt: new Date(startMs).toISOString(),
          durationMin: bDur,
          controllers: isConsole(book) ? bCtrl : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setBMsg(bookErr(j.error)); setBBusy(false); if (j.error === "time_unavailable") loadAvailability(book); return; }
      if (j.checkoutUrl) { window.location.href = j.checkoutUrl as string; return; }
      setBMsg(`✓ Reserved! Your code is ${j.reservationCode}.${j.minOrder ? ` A minimum order of ₱${j.minOrder} applies at the cafe.` : ""}`);
    } catch { setBMsg("Could not reserve — check your connection."); }
    setBBusy(false);
  }

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

  // Only reservable dining tables + PS5, numbered per type ("Table 1…", "PS5 1…") in stored order.
  const ps5: FloorplanElement[] = [];
  const tables: FloorplanElement[] = [];
  for (const el of [...elements].sort((a, b) => a.z_index - b.z_index)) {
    if (!el.reservable) continue;
    if (el.type === "ps5") ps5.push(el);
    else if (DINING.has(el.type)) tables.push(el);
  }
  if (ps5.length === 0 && tables.length === 0) return null;

  const numbered: Array<{ el: FloorplanElement; name: string; kind: "ps5" | "table" }> = [
    ...ps5.map((el, i) => ({ el, name: `PS5 ${i + 1}`, kind: "ps5" as const })),
    ...tables.map((el, i) => ({ el, name: `Table ${i + 1}`, kind: "table" as const })),
  ];
  const bookName = book ? (book.type === "ps5" ? `PS5 ${ps5.indexOf(book) + 1}` : `Table ${tables.indexOf(book) + 1}`) : "";

  const inputCls = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-cream";

  return (
    <section className="relative py-24 md:py-32 border-y border-line bg-bg-soft overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="container-edge relative">
        <div className="max-w-2xl mb-10">
          <p className="terminal-label">tables_ps5.feed</p>
          <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream">
            Tables &amp; PS5.
          </h2>
          <p className="mt-4 text-cream-dim text-lg">
            Dining tables and PlayStation 5 stations at {branchName}. Reserve a spot and we&apos;ll have it
            ready when you arrive.
          </p>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {numbered.map(({ el, name, kind }) => {
            const live = el.live_status === "active" && el.live_ends_at;
            const left = live ? new Date(el.live_ends_at as string).getTime() - now : 0;
            const busy = live && left > 0;
            const Icon = kind === "ps5" ? Gamepad2 : UtensilsCrossed;
            const bookable = canBook(el) && !busy;
            return (
              <div
                key={el.id}
                className={`relative aspect-square rounded-xl border overflow-hidden ${
                  busy ? "border-line-bright bg-bg-card" : "border-phosphor/40 bg-phosphor/5 glow-phosphor"
                }`}
              >
                <div className="absolute top-3 right-3">
                  <span
                    className={`block h-2 w-2 rounded-full ${
                      busy
                        ? "bg-amber shadow-[0_0_6px_var(--color-amber)]"
                        : "bg-phosphor shadow-[0_0_8px_var(--color-phosphor)] animate-pulse"
                    }`}
                  />
                </div>
                <div className="h-full p-4 flex flex-col justify-between">
                  <div>
                    <Icon className={`h-5 w-5 ${busy ? "text-amber" : "text-phosphor"}`} strokeWidth={1.5} />
                    <p className="mt-3 font-display text-xl font-bold text-cream tracking-tight">{name}</p>
                  </div>

                  {busy ? (
                    <div>
                      <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">// in use</p>
                      <span className="font-mono text-[0.7rem] text-amber">{fmtLeft(left)}</span>
                    </div>
                  ) : bookable ? (
                    <button
                      type="button"
                      onClick={() => openBook(el)}
                      title={`Reserve ${name}`}
                      className="block w-full text-center font-mono text-[0.65rem] uppercase tracking-widest text-phosphor border border-phosphor/40 rounded px-2 py-1.5 hover:bg-phosphor/10 transition"
                    >
                      <Power className="inline h-3 w-3 mr-1" />
                      Reserve
                    </button>
                  ) : (
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-phosphor">// free</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {book && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !bBusy && setBook(null)}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-bg-card p-6 border border-line" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl font-bold text-cream">Reserve {bookName}</h3>
            <p className="mt-1 text-sm text-cream-dim">
              {book.billing_mode === "time_rate"
                ? `₱${book.rate_per_hour}/hour — pay online to confirm.`
                : `Minimum order ₱${book.min_order_amount} at the cafe.`}
            </p>

            <div className="mt-4 space-y-3">
              <input className={inputCls} placeholder="Your name" value={bName} onChange={(e) => setBName(e.target.value)} maxLength={120} />
              <input className={inputCls} placeholder="Phone or email (optional)" value={bContact} onChange={(e) => setBContact(e.target.value)} maxLength={60} />

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-cream-dim">
                  Date
                  <select className={`mt-1 ${inputCls}`} value={bDate} onChange={(e) => { setBDate(e.target.value); setBTime(""); }}>
                    <option value="">Select…</option>
                    {dayOptions(bNow).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm text-cream-dim">
                  Start time
                  <select className={`mt-1 ${inputCls}`} value={bTime} onChange={(e) => setBTime(e.target.value)} disabled={!bDate}>
                    <option value="">{bDate ? "Select…" : "Pick a date first"}</option>
                    {timeOptions(bDate, bNow).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block text-sm text-cream-dim">
                How long
                <select className={`mt-1 ${inputCls}`} value={bDur} onChange={(e) => setBDur(parseInt(e.target.value, 10))}>
                  {DUR_OPTIONS.map((d) => <option key={d.m} value={d.m}>{d.l}</option>)}
                </select>
              </label>

              {isConsole(book) && (
                <label className="block text-sm text-cream-dim">
                  Controllers
                  <select className={`mt-1 ${inputCls}`} value={bCtrl} onChange={(e) => setBCtrl(parseInt(e.target.value, 10))} title="Choose how many controllers">
                    {Array.from({ length: Number(book.max_controllers) || 1 }, (_, i) => i + 1).map((c) => {
                      const inc = Number(book.included_controllers) || 0;
                      const extra = Number(book.extra_controller_price) || 0;
                      const add = extra > 0 && c > inc ? ` (+₱${((c - inc) * extra).toLocaleString()})` : (c <= inc ? " (included)" : "");
                      return <option key={c} value={c}>{c} controller{c > 1 ? "s" : ""}{add}</option>;
                    })}
                  </select>
                </label>
              )}

              {/* Open / reserved times for the chosen day */}
              {bDate && (
                <div className="rounded-lg border border-line bg-bg px-3 py-2">
                  <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">Already reserved</p>
                  {dayReserved.length === 0 ? (
                    <p className="mt-1 text-sm text-phosphor">No bookings yet — all times open.</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {dayReserved.map((r, i) => (
                        <li key={i} className="text-sm text-amber">{fmtClock(new Date(r.start))} – {fmtClock(new Date(r.ends))}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Arrival policy */}
              <div className="flex gap-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2">
                <Clock className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                <p className="text-xs text-cream-dim leading-relaxed">
                  Your time <span className="text-cream font-semibold">starts at the time you pick — not when you arrive</span>.
                  Please be on time; if you&apos;re late, the session still ends at the scheduled time.
                </p>
              </div>

              {book.billing_mode === "time_rate" && (
                <p className="text-sm font-semibold text-cream">
                  Total: ₱{spotPrice(book, bDur, bCtrl).toLocaleString()}
                  {isConsole(book) && bCtrl > (Number(book.included_controllers) || 0) && (
                    <span className="text-cream-dim font-normal"> ({bCtrl} controllers)</span>
                  )}
                </p>
              )}

              {/* Inline validation reason (also gates the button) */}
              {!startMs ? (
                <p className="text-xs text-cream-dim">Pick a date and start time to continue.</p>
              ) : isPast ? (
                <p className="text-sm text-amber">That time is in the past — pick a later time.</p>
              ) : clashes ? (
                <p className="text-sm text-amber">That time overlaps an existing reservation — pick another.</p>
              ) : null}
              {bMsg && <p className="text-sm text-amber">{bMsg}</p>}
            </div>

            <div className="mt-5 flex gap-2">
              <button className="flex-1 rounded-lg border border-line py-2 text-cream-dim" onClick={() => setBook(null)} disabled={bBusy} title="Cancel reservation">Cancel</button>
              <button
                className="flex-1 rounded-lg bg-phosphor py-2 font-semibold text-bg disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={submitBook}
                disabled={bBusy || !canPay}
                title={canPay ? "Confirm reservation" : "Pick a date and time first"}
              >
                {bBusy ? "…" : book.billing_mode === "time_rate" ? "Pay & reserve" : "Reserve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
