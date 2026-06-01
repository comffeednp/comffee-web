"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Clock,
  Cpu,
  IdCard,
  Loader2,
  Minus,
  Plus,
  Power,
  User,
} from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { isRateAvailableNow } from "@/lib/rate-window";
import { getSupabaseBrowser } from "@/lib/supabase/client";

interface Branch {
  id: string;
  slug: string;
  name: string;
}

interface Station {
  id: string;
  name: string;
  isOccupied: boolean;
  tier: string | null;
  currentSessionEndsAt: string | null;
  isMemberSession: boolean;
}

interface Rate {
  id: string;
  label: string;
  description: string | null;
  pricePhp: number;
  unit: string;            // 'hour' | 'pack' | 'session' | 'night'
  tier: string | null;     // 'regular' | 'vip' | null
  durationMinutes: number;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
}

interface Props {
  branch: Branch;
  stations: Station[];
  rates: Rate[];
  requestedPc: string | null;
  requestedTier: string | null;
  // Online-payment additions (Chunk 5/6). Flat reservation fee, the signed-in Google email
  // (prefills the name + travels to the create API), and the per-branch reservation rules + the
  // members-only bonus DISPLAY settings (display only — PanCafe applies the real bonus).
  reservationFeePhp: number;
  signedInEmail: string | null;
  minHours: number;
  minTopup: number;
  bonus: { type: string; value: number; threshold: number };
}

type Mode = "walk_in" | "member";
type Step = "pick" | "loading" | "done" | "error";

export default function ReservePCClient({
  branch,
  stations: initialStations,
  rates,
  requestedPc,
  reservationFeePhp,
  signedInEmail,
  minHours,
  minTopup,
  bonus,
}: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [mode, setMode] = useState<Mode>("walk_in");
  const [stations, setStations] = useState<Station[]>(initialStations);

  // Re-fetch + subscribe to Realtime on mount — handles back-navigation and live updates
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowser>;
    try { supabase = getSupabaseBrowser(); } catch { return; }

    const toStation = (row: Record<string, unknown>): Station => ({
      id: row.id as string,
      name: row.station_name as string,
      isOccupied: row.is_occupied as boolean,
      tier: (row.pc_tier ?? null) as string | null,
      currentSessionEndsAt: (row.current_session_ends_at ?? null) as string | null,
      isMemberSession: (row.is_member_session ?? false) as boolean,
    });

    supabase
      .from("pc_stations")
      .select("*")
      .eq("branch_id", branch.id)
      .order("sort_order", { ascending: true })
      .order("station_name", { ascending: true })
      .then(({ data }: { data: Record<string, unknown>[] | null }) => {
        if (data && data.length > 0) setStations(data.map(toStation));
      });

    const channel = supabase
      .channel(`reserve_pc_stations:${branch.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pc_stations", filter: `branch_id=eq.${branch.id}` },
        (payload: { eventType: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
          if (payload.eventType === "DELETE" && payload.old) {
            setStations((prev) => prev.filter((s) => s.id !== payload.old!.id));
            return;
          }
          if (!payload.new) return;
          const updated = toStation(payload.new);
          setStations((prev) => {
            const next = [...prev];
            const idx = next.findIndex((s) => s.id === updated.id);
            if (idx >= 0) next[idx] = updated; else next.push(updated);
            return next.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          });
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [branch.id]);

  // Default: requested PC (if vacant), otherwise first vacant
  const [stationName, setStationName] = useState(() => {
    if (requestedPc) {
      const r = initialStations.find((s) => s.name === requestedPc);
      if (r && !r.isOccupied) return r.name;
    }
    return initialStations.find((s) => !s.isOccupied)?.name ?? "";
  });

  const [rateId, setRateId] = useState<string>("");
  const [quantity, setQuantity] = useState(1); // for hourly rates
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  // Member-mode online-reservation fields (Chunk 6).
  const [memberTopup, setMemberTopup] = useState(""); // peso string; must be >= minTopup
  const [memberFirstName, setMemberFirstName] = useState("");
  const [memberLastName, setMemberLastName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-tick every 30s so the night-promo availability badge updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Prefill the name from the signed-in Google account (editable). Only seeds an empty field so we
  // never clobber what the customer typed.
  useEffect(() => {
    if (signedInEmail && !name) {
      const guess = signedInEmail.split("@")[0]?.replace(/[._]+/g, " ").trim();
      if (guess) setName(guess.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInEmail]);

  // Which PC is selected + its tier
  const selectedStation = useMemo(
    () => stations.find((s) => s.name === stationName) ?? null,
    [stations, stationName],
  );
  const selectedTier = selectedStation?.tier ?? null;

  // Filter rates to the selected PC's tier
  const applicableRates = useMemo(() => {
    if (!selectedTier) return rates; // no tier tag on this station → show all
    return rates.filter((r) => r.tier === null || r.tier === selectedTier);
  }, [rates, selectedTier]);

  // Reset rate selection if tier changes and current rate is no longer applicable
  useEffect(() => {
    if (rateId && !applicableRates.find((r) => r.id === rateId)) {
      setRateId("");
    }
  }, [applicableRates, rateId]);

  const selectedRate = useMemo(
    () => applicableRates.find((r) => r.id === rateId) ?? null,
    [applicableRates, rateId],
  );

  // Compute total
  const { totalPhp, totalMinutes } = useMemo(() => {
    if (!selectedRate) return { totalPhp: 0, totalMinutes: 0 };
    const isHourly = selectedRate.unit === "hour";
    const qty = isHourly ? quantity : 1;
    return {
      totalPhp: selectedRate.pricePhp * qty,
      totalMinutes: selectedRate.durationMinutes * qty,
    };
  }, [selectedRate, quantity]);

  const vacantStations = stations.filter((s) => !s.isOccupied);

  // Walk-in must book at least `minHours` of time. Compare the booked minutes against the minimum.
  // (Applies to every rate type — a 3-hour pack already clears a 1-hour minimum.)
  const bookedHours = totalMinutes / 60;
  const walkInMeetsMinHours = mode !== "walk_in" || !selectedRate || bookedHours >= minHours;

  // Member top-up parsed + min-top-up gate (the wall against prank reserving, flowchart §G).
  const topupNum = Number(memberTopup);
  const topupValid = Number.isFinite(topupNum) && topupNum > 0;
  const memberMeetsMinTopup = mode !== "member" || (topupValid && topupNum >= minTopup);

  // Members-only bonus to SHOW (display only — PanCafe applies the real bonus). null = nothing to show.
  const displayBonus = useMemo(() => {
    if (mode !== "member") return null;
    if (!topupValid || topupNum <= 0) return null;
    if (!bonus.value || bonus.value <= 0) return null;
    if (bonus.threshold > 0 && topupNum < bonus.threshold) return null;
    const raw = bonus.type === "fixed" ? bonus.value : (topupNum * bonus.value) / 100;
    const bonusPhp = Math.round(raw);
    if (bonusPhp <= 0) return null;
    return { bonusPhp, totalPhp: Math.round(topupNum) + bonusPhp };
  }, [mode, topupValid, topupNum, bonus]);

  // What the customer pays at PayMongo = flat fee + (walk-in PC time | member top-up).
  const payNowPhp =
    reservationFeePhp + (mode === "walk_in" ? totalPhp : topupValid ? topupNum : 0);

  const canSubmit = useMemo(() => {
    if (!stationName) return false;
    if (!name.trim()) return false;
    if (mode === "member") {
      if (!memberNumber.trim()) return false;
      if (!memberMeetsMinTopup) return false;
    }
    if (mode === "walk_in") {
      if (!selectedRate) return false;
      if (!isRateAvailableNow(selectedRate)) return false;
      if (!walkInMeetsMinHours) return false;
    }
    return true;
  }, [stationName, name, mode, memberNumber, selectedRate, memberMeetsMinTopup, walkInMeetsMinHours]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    setErrorMsg(null);
    setStep("loading");
    startTransition(async () => {
      try {
        const res = await fetch("/api/pc-reservations/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId: branch.id,
            stationName,
            customerName: name.trim(),
            customerPhone: phone.trim(),
            customerType: mode,
            memberNumber: mode === "member" ? memberNumber.trim() : "",
            memberTopup: mode === "member" && topupValid ? topupNum : undefined,
            memberFirstName: mode === "member" ? memberFirstName.trim() : "",
            memberLastName: mode === "member" ? memberLastName.trim() : "",
            rateId: mode === "walk_in" ? rateId : "",
            quantity: mode === "walk_in" ? quantity : 1,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStep("error");
          setErrorMsg(data.error ?? "reservation failed");
          return;
        }
        setReservationId(data.reservationId);
        // PayMongo hosted-checkout flow (2026-06-01): open PayMongo's secure page (QRPh — one QR for
        // GCash/Maya/banks; + card only when ≥₱100, set server-side). PayMongo's success_url returns the customer to the
        // confirmed page, which polls pay-status and flips to "Reserved! + code" the instant the webhook
        // marks it paid. We navigate in the SAME tab (not window.open) so the success redirect lands
        // back here cleanly — a blocked popup would otherwise strand the customer on "reserving…".
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        // Fallback (no checkout url — shouldn't happen): go to the confirmed page so the customer at
        // least sees their booking and can retry, rather than a dead "reserving…" screen.
        if (data.reservationId) {
          window.location.href = `/branches/${branch.slug}/reserve-pc/confirmed/${data.reservationId}`;
          return;
        }
        setStep("error");
        setErrorMsg("could not start the reservation");
      } catch (e) {
        setStep("error");
        setErrorMsg(e instanceof Error ? e.message : "network error");
      }
    });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      {/* LEFT — single screen */}
      <div className="border border-line-bright bg-bg-card rounded-2xl p-6 md:p-10">
        <AnimatePresence mode="wait">
          {step === "pick" && (
            <motion.div
              key="pick"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-10"
            >
              {/* ---------- STATION ---------- */}
              <section>
                <p className="terminal-label">// pick_station</p>
                <h2 className="mt-2 font-display text-2xl md:text-3xl font-bold text-cream tracking-tight">
                  Which station?
                </h2>
                <p className="mt-2 text-sm text-cream-dim">
                  Vacant stations are highlighted. In-use ones can&apos;t be reserved.
                </p>

                <div className="mt-6 grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
                  {stations.map((s) => {
                    const selected = s.name === stationName;
                    const occupied = s.isOccupied;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => !occupied && setStationName(s.name)}
                        disabled={occupied}
                        title={s.isOccupied ? `${s.name} is currently in use` : `Select station ${s.name}`}
                        className={`aspect-square flex flex-col items-center justify-center rounded-lg border transition relative ${
                          occupied
                            ? "border-line bg-bg opacity-40 cursor-not-allowed"
                            : selected
                            ? "border-amber bg-amber/10 glow-amber"
                            : "border-phosphor/40 bg-phosphor/5 hover:bg-phosphor/10"
                        }`}
                      >
                        {s.tier && (
                          <span className="absolute top-1 right-1 font-mono text-[0.5rem] uppercase text-mocha">
                            {s.tier}
                          </span>
                        )}
                        <Cpu
                          className={`h-4 w-4 ${
                            occupied ? "text-mocha" : selected ? "text-amber" : "text-phosphor"
                          }`}
                          strokeWidth={1.5}
                        />
                        <span
                          className={`mt-2 font-mono text-xs font-bold ${
                            occupied ? "text-mocha" : selected ? "text-amber" : "text-cream"
                          }`}
                        >
                          {s.name}
                        </span>
                        {occupied && (
                          <span className="mt-1 font-mono text-[0.55rem] text-center leading-tight">
                            {s.currentSessionEndsAt
                              ? <InlineCountdown endsAt={s.currentSessionEndsAt} />
                              : s.isMemberSession
                              ? <span className="text-mocha">member</span>
                              : null}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {vacantStations.length === 0 && (
                  <div className="mt-4 p-3 border border-amber/40 rounded-lg bg-amber/5 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber mt-0.5" />
                    <p className="text-sm text-cream-dim">
                      All stations are in use right now. Wait until one frees up.
                    </p>
                  </div>
                )}
              </section>

              {/* ---------- MODE TOGGLE ---------- */}
              <section>
                <p className="terminal-label">// how_paying</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ModeTab
                    active={mode === "walk_in"}
                    onClick={() => setMode("walk_in")}
                    icon={User}
                    title="Walk-in"
                    subtitle="Pay at the counter"
                  />
                  <ModeTab
                    active={mode === "member"}
                    onClick={() => setMode("member")}
                    icon={IdCard}
                    title="Member"
                    subtitle="Use your account"
                  />
                </div>
              </section>

              {/* ---------- RATE (walk-in only) ---------- */}
              {mode === "walk_in" && (
                <section>
                  <p className="terminal-label">// pick_rate</p>
                  <h3 className="mt-2 font-display text-xl font-bold text-cream">
                    {selectedTier
                      ? `${selectedTier.toUpperCase()} rates`
                      : "Available rates"}
                  </h3>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {applicableRates.map((r) => {
                      const available = isRateAvailableNow(r);
                      const isSelected = rateId === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => available && setRateId(r.id)}
                          disabled={!available}
                          title={available ? `Select rate: ${r.label}` : `${r.label} — not available now`}
                          className={`relative text-left p-4 rounded-xl border transition ${
                            !available
                              ? "border-line bg-bg opacity-50 cursor-not-allowed"
                              : isSelected
                              ? "border-amber bg-amber/10 glow-amber"
                              : "border-line-bright bg-bg hover:border-amber/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-display font-semibold text-cream">
                                {r.label}
                              </p>
                              {r.description && (
                                <p className="mt-1 text-[0.7rem] text-cream-dim leading-relaxed">
                                  {r.description}
                                </p>
                              )}
                            </div>
                            <span className="font-mono text-amber font-bold whitespace-nowrap">
                              {formatPHP(r.pricePhp)}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                            <span>
                              {r.unit === "hour" ? "per hour" : `${r.durationMinutes}m`}
                            </span>
                            {r.timeWindowStart && r.timeWindowEnd && (
                              <span
                                className={
                                  available ? "text-phosphor" : "text-amber"
                                }
                              >
                                {r.timeWindowStart}–{r.timeWindowEnd}
                              </span>
                            )}
                          </div>
                          {!available && r.timeWindowStart && (
                            <span className="absolute top-2 right-2 font-mono text-[0.6rem] uppercase text-amber">
                              not now
                            </span>
                          )}
                          {isSelected && (
                            <span className="absolute top-2 left-2">
                              <Check className="h-3.5 w-3.5 text-amber" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quantity stepper for hourly rates */}
                  {selectedRate && selectedRate.unit === "hour" && (
                    <div className="mt-5 flex items-center gap-4">
                      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                        // how_many_hours
                      </span>
                      <div className="flex items-center gap-1 border border-line-bright rounded-md">
                        <button
                          type="button"
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          title="Decrease hours"
                          className="px-3 py-2 text-cream-dim hover:text-amber"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-mono text-cream w-10 text-center">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity((q) => Math.min(12, q + 1))}
                          title="Increase hours"
                          className="px-3 py-2 text-cream-dim hover:text-amber"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="font-mono text-amber font-bold">
                        = {formatPHP(totalPhp)}
                      </span>
                    </div>
                  )}

                  {/* Minimum-hours wall (flowchart §F). Show why the button is blocked. */}
                  {selectedRate && !walkInMeetsMinHours && (
                    <p className="mt-3 font-mono text-xs text-amber">
                      // this branch needs at least {minHours} hour{minHours === 1 ? "" : "s"} booked online — pick a longer package or add hours.
                    </p>
                  )}
                </section>
              )}

              {/* ---------- MEMBER (member mode only): number + top-up + optional name ---------- */}
              {mode === "member" && (
                <section className="space-y-6">
                  <div>
                    <p className="terminal-label">// member_number</p>
                    <input
                      type="text"
                      value={memberNumber}
                      onChange={(e) => setMemberNumber(e.target.value)}
                      className="reserve-input mt-3"
                      placeholder="Your PanCafe member number"
                      autoComplete="off"
                    />
                    <p className="mt-2 text-[0.7rem] text-mocha">
                      // the cashier will verify this when you arrive.
                    </p>
                  </div>

                  {/* Top-up amount — must clear the branch minimum (the wall against prank reserving). */}
                  <div>
                    <p className="terminal-label">// top_up_amount</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="font-mono text-amber font-bold text-lg">₱</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={minTopup || 1}
                        step="1"
                        value={memberTopup}
                        onChange={(e) => setMemberTopup(e.target.value)}
                        className="reserve-input"
                        placeholder={minTopup > 0 ? `${minTopup} or more` : "amount to load"}
                        autoComplete="off"
                      />
                    </div>
                    {minTopup > 0 && (
                      <p className="mt-2 font-mono text-[0.7rem] text-mocha">
                        // minimum top-up online is {formatPHP(minTopup)}.
                      </p>
                    )}
                    {memberTopup !== "" && !memberMeetsMinTopup && (
                      <p className="mt-1 font-mono text-xs text-amber">
                        // top up at least {formatPHP(minTopup)} to reserve online.
                      </p>
                    )}
                    {/* Bonus DISPLAY only — PanCafe applies the real bonus when the cashier loads it. */}
                    {displayBonus && (
                      <p className="mt-2 font-mono text-xs text-phosphor">
                        // top up {formatPHP(topupNum)} → get {formatPHP(displayBonus.totalPhp)} (includes {formatPHP(displayBonus.bonusPhp)} bonus). the cashier loads your bonus on arrival.
                      </p>
                    )}
                  </div>

                  {/* Optional first/last name — shown to the cashier to confirm who you are (flowchart §G). */}
                  <div>
                    <p className="terminal-label">// your_name_optional</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <input
                        type="text"
                        value={memberFirstName}
                        onChange={(e) => setMemberFirstName(e.target.value)}
                        className="reserve-input"
                        placeholder="First name (optional)"
                        autoComplete="off"
                      />
                      <input
                        type="text"
                        value={memberLastName}
                        onChange={(e) => setMemberLastName(e.target.value)}
                        className="reserve-input"
                        placeholder="Last name (optional)"
                        autoComplete="off"
                      />
                    </div>
                    <p className="mt-2 text-[0.7rem] text-mocha">
                      // helps the cashier confirm it&apos;s you when you arrive.
                    </p>
                  </div>
                </section>
              )}

              {/* ---------- NAME + PHONE ---------- */}
              <section>
                <p className="terminal-label">// your_info</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                      // full name *
                    </span>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="reserve-input mt-2"
                      placeholder="Player one"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                      // phone
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="reserve-input mt-2"
                      placeholder="+63 9XX XXX XXXX"
                    />
                  </label>
                </div>
              </section>

              {/* ---------- FEE BREAKDOWN (always shown before paying, flowchart §E) ---------- */}
              <div className="rounded-lg border border-line-bright bg-bg p-4 font-mono text-sm">
                <div className="flex items-center justify-between text-cream-dim">
                  <span>
                    {mode === "walk_in" ? "PC time" : "Top-up"}
                  </span>
                  <span className="text-cream">
                    {formatPHP(mode === "walk_in" ? totalPhp : topupValid ? topupNum : 0)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-cream-dim">
                  <span>Reservation fee</span>
                  <span className="text-cream">{formatPHP(reservationFeePhp)}</span>
                </div>
                <div className="mt-2 pt-2 border-t border-line flex items-center justify-between">
                  <span className="text-phosphor uppercase tracking-widest text-[0.7rem]">Pay now online</span>
                  <span className="text-amber font-bold text-base">{formatPHP(payNowPhp)}</span>
                </div>
              </div>

              {errorMsg && (
                <p className="font-mono text-xs text-red-400">// {errorMsg}</p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                title="Pay online to reserve this station"
                className="key-cap key-cap-primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Power className="h-4 w-4" />
                {`Pay ${formatPHP(payNowPhp)} to reserve ${stationName || "station"}`}
              </button>
            </motion.div>
          )}

          {/* ---------- LOADING ---------- */}
          {step === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center"
            >
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full border-4 border-line-bright border-t-amber animate-spin" />
                  <Cpu className="absolute inset-0 m-auto h-7 w-7 text-amber" />
                </div>
              </div>
              <p className="mt-8 font-mono text-sm text-phosphor">
                // RESERVING YOUR STATION…
              </p>
            </motion.div>
          )}

          {/* ---------- DONE (brief fallback while the browser redirects to PayMongo) ---------- */}
          {/* The PC is NOT held until payment lands, so we never say "reserved" here — we only show
              this if window.location.href to the PayMongo checkout is slow. */}
          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-16 text-center"
            >
              <div className="flex justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-amber" />
              </div>
              <p className="mt-6 font-mono text-sm text-phosphor">// RESERVING YOUR STATION…</p>
              <p className="mt-2 text-cream-dim max-w-md mx-auto text-sm">
                Hang on — opening the secure payment page for {stationName}.
              </p>
              {reservationId && (
                <p className="mt-4 font-mono text-[0.65rem] text-mocha break-all">
                  // ref: {reservationId}
                </p>
              )}
            </motion.div>
          )}

          {/* ---------- ERROR ---------- */}
          {step === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
              <p className="mt-6 font-mono text-sm text-red-400">// {errorMsg}</p>
              <button
                type="button"
                onClick={() => {
                  setStep("pick");
                  setErrorMsg(null);
                }}
                title="Try again"
                className="mt-6 key-cap"
              >
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT — sticky summary */}
      <aside className="lg:sticky lg:top-24 self-start">
        <div className="border border-line-bright bg-bg-card rounded-2xl p-6 space-y-4">
          <p className="terminal-label">// summary</p>
          <h3 className="font-display text-2xl font-bold text-cream">{branch.name}</h3>

          <div className="space-y-3 text-sm pt-2 border-t border-line">
            <SummaryRow label="station" value={stationName || "—"} accent />
            {selectedTier && <SummaryRow label="tier" value={selectedTier.toUpperCase()} />}
            <SummaryRow label="mode" value={mode === "walk_in" ? "Walk-in" : "Member"} />
            {mode === "walk_in" && selectedRate && (
              <>
                <SummaryRow label="rate" value={selectedRate.label} />
                <SummaryRow label="duration" value={`${totalMinutes} min`} />
                <SummaryRow label="PC time" value={formatPHP(totalPhp)} />
              </>
            )}
            {mode === "member" && memberNumber && (
              <SummaryRow label="member" value={`#${memberNumber}`} />
            )}
            {mode === "member" && topupValid && (
              <SummaryRow label="top-up" value={formatPHP(topupNum)} />
            )}
            {mode === "member" && displayBonus && (
              <SummaryRow label="you get" value={formatPHP(displayBonus.totalPhp)} />
            )}
            <SummaryRow label="reservation fee" value={formatPHP(reservationFeePhp)} />
            <SummaryRow label="pay now" value={formatPHP(payNowPhp)} accent />
          </div>

          <div className="pt-4 border-t border-line flex items-start gap-2 text-[0.7rem] font-mono uppercase tracking-widest text-mocha">
            <Clock className="h-3 w-3 mt-0.5 text-phosphor" />
            <span>10-minute grace window to arrive once you&apos;ve paid</span>
          </div>
        </div>
      </aside>

      <style>{`
        .reserve-input {
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
        .reserve-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
        }
      `}</style>
    </div>
  );
}

function InlineCountdown({ endsAt }: { endsAt: string }) {
  const calc = () => Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 60000));
  const [remaining, setRemaining] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setRemaining(calc), 10000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  if (remaining <= 0) return <span className="text-red-400">ending</span>;
  const hrs = Math.floor(remaining / 60);
  const mins = remaining % 60;
  return (
    <span className={remaining <= 10 ? "text-red-400" : "text-amber"}>
      {hrs > 0 ? `${hrs}h${mins}m` : `${mins}m`}
    </span>
  );
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Select ${title} mode`}
      className={`p-4 rounded-xl border transition text-left ${
        active
          ? "border-amber bg-amber/10 glow-amber"
          : "border-line-bright bg-bg hover:border-amber/60"
      }`}
    >
      <Icon className={`h-5 w-5 ${active ? "text-amber" : "text-cream-dim"}`} />
      <p className="mt-3 font-display font-semibold text-cream">{title}</p>
      <p className="mt-1 text-[0.7rem] text-mocha">{subtitle}</p>
    </button>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
        // {label}
      </span>
      <span
        className={`text-right text-sm ${
          accent ? "text-amber font-bold font-mono" : "text-cream"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
