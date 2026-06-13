"use client";

// Numbered bookable spots (dining tables + PS5) for a cafe branch — shown as a simple numbered tile grid
// in the SAME style as the live PC 1–12 board (owner 2026-06-13: dropped the visual aerial floor plan in
// favour of plain numbering). Each spot tiles as "Table 1" / "PS5 1", shows live availability + remaining
// time the POS pushes (live_status / live_ends_at), and — when the owner allows online booking — opens the
// existing reservation flow (PS5 pay-online, tables reserve against a minimum order).
import { useEffect, useState } from "react";
import { Gamepad2, UtensilsCrossed, Power } from "lucide-react";
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
  live_status?: string | null;
  live_ends_at?: string | null;
}

const DINING = new Set(["table", "long_table"]);

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return "ending soon";
}

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
                      <span className="font-mono text-[0.7rem] text-amber">{fmt(left)}</span>
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
          <div className="w-full max-w-sm rounded-2xl bg-bg-card p-6 border border-line" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl font-bold text-cream">
              Reserve {book.type === "ps5" ? "PS5" : "table"}
            </h3>
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
    </section>
  );
}
