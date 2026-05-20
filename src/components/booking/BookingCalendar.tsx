"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BlockedRange {
  check_in: string;
  check_out: string;
  source: string;
}

interface Props {
  blocked: BlockedRange[];
  checkIn: string;
  checkOut: string;
  onChange: (dates: { checkIn: string; checkOut: string }) => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Use local date components to avoid UTC offset shifting dates
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysToStr(ymd: string, n: number): string {
  const d = new Date(ymd);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

function findCutoff(from: string, blocked: BlockedRange[]): string | null {
  // First blocked check_in strictly after `from`
  let cutoff: string | null = null;
  for (const r of blocked) {
    if (r.check_in > from && (!cutoff || r.check_in < cutoff)) cutoff = r.check_in;
  }
  return cutoff;
}

export default function BookingCalendar({ blocked, checkIn, checkOut, onChange }: Props) {
  const today = new Date();
  const todayStr = toYMD(today);

  // pendingIn: check-in chosen but checkout not yet picked
  const [pendingIn, setPendingIn] = useState<string | null>(null);

  const [year, setYear] = useState(() => new Date(checkIn).getFullYear());
  const [month, setMonth] = useState(() => new Date(checkIn).getMonth());
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const phase: "checkin" | "checkout" = pendingIn ? "checkout" : "checkin";
  const displayCheckIn = pendingIn ?? checkIn;

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  // Build grid using local Date so toYMD gives correct local dates
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstOfMonth.getDay();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    cells.push(new Date(year, month, 1 - startOffset + i));
  }

  // Build blocked day set using local components
  const blockedDays = new Set<string>();
  for (const r of blocked) {
    const end = new Date(r.check_out);
    let cur = new Date(r.check_in);
    while (cur < end) {
      blockedDays.add(toYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }

  // In checkout phase: cutoff = first blocked check_in after pendingIn
  // Last selectable night = day before cutoff (checkout = cutoff is OK)
  const cutoff = pendingIn ? findCutoff(pendingIn, blocked) : null;

  function handleClick(dayStr: string, isPast: boolean) {
    const isBlocked = blockedDays.has(dayStr);

    if (phase === "checkin") {
      if (isPast || isBlocked) return;
      setPendingIn(dayStr);
      return;
    }

    // Checkout phase — user is selecting their last night
    if (dayStr === pendingIn) {
      // Tapping check-in again → cancel, go back to phase 1
      setPendingIn(null);
      return;
    }
    if (dayStr < pendingIn!) return; // before check-in not allowed
    if (isPast) return;
    if (isBlocked) return; // can't stay on a blocked night
    if (cutoff && dayStr >= cutoff) return; // would overlap next booking

    // checkout = last night + 1 (departure day)
    const newCheckOut = addDaysToStr(dayStr, 1);
    onChange({ checkIn: pendingIn!, checkOut: newCheckOut });
    setPendingIn(null);
  }

  // Range to highlight: check-in → hover (in checkout phase) or confirmed checkOut
  const rangeStart = displayCheckIn;
  const rangeEnd = phase === "checkout"
    ? (hoverDate && hoverDate > rangeStart ? addDaysToStr(hoverDate, 1) : null)
    : checkOut;

  function isInRange(dayStr: string) {
    if (!rangeStart || !rangeEnd) return false;
    return dayStr > rangeStart && dayStr < rangeEnd;
  }

  return (
    <div>
      {/* Phase indicator pills */}
      <div className="mb-3 flex items-center gap-3 font-mono text-[0.7rem] flex-wrap">
        <button
          onClick={() => setPendingIn(null)}
          className={`px-3 py-1.5 rounded-md border transition ${
            phase === "checkin"
              ? "border-amber/60 bg-amber/10 text-amber"
              : "border-line-bright text-cream-dim hover:border-amber/30"
          }`}
        >
          CHECK-IN: <span className="font-bold">{displayCheckIn}</span>
        </button>
        <span className="text-mocha">→</span>
        <div className={`px-3 py-1.5 rounded-md border ${
          phase === "checkout"
            ? "border-amber/60 bg-amber/10 text-amber animate-pulse"
            : "border-line-bright text-cream-dim"
        }`}>
          CHECK-OUT:{" "}
          <span className="font-bold">
            {phase === "checkout" ? "select ↓" : checkOut}
          </span>
        </div>
      </div>

      <div className="border border-line-bright rounded-xl bg-bg overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <button onClick={prevMonth} className="p-1.5 rounded-md text-cream-dim hover:text-cream hover:bg-bg-elev transition" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-display font-bold text-cream text-sm">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-md text-cream-dim hover:text-cream hover:bg-bg-elev transition" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-line">
          {DAYS.map(d => (
            <div key={d} className="py-2 text-center font-mono text-[0.58rem] uppercase tracking-widest text-mocha">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 divide-x divide-line/40">
          {cells.map((date, i) => {
            const dayStr = toYMD(date);
            const isCurrentMonth = date.getMonth() === month;
            const isToday = dayStr === todayStr;
            const isPast = dayStr < todayStr;
            const isBlocked = blockedDays.has(dayStr);
            const isCheckIn = dayStr === displayCheckIn;
            const isCheckOut = phase === "checkin" && dayStr === checkOut;
            const inRange = isInRange(dayStr);
            const isLastRow = i >= totalCells - 7;

            const disabledInPhase2 =
              phase === "checkout" &&
              (isPast || isBlocked || dayStr < pendingIn! || (!!cutoff && dayStr >= cutoff));
            const notClickable = isPast || (phase === "checkin" && isBlocked) || !!disabledInPhase2;

            let bg = "";
            if (isCheckIn) bg = "bg-amber/25";
            else if (isCheckOut) bg = "bg-amber/25";
            else if (inRange) bg = "bg-amber/10";
            else if (isBlocked && !isPast && phase === "checkin") bg = "bg-red-500/10";

            return (
              <div
                key={dayStr}
                onClick={() => isCurrentMonth && !notClickable && handleClick(dayStr, isPast)}
                onMouseEnter={() => {
                  if (phase === "checkout" && isCurrentMonth && !isPast && !isBlocked && dayStr >= pendingIn! && !(cutoff && dayStr >= cutoff)) {
                    setHoverDate(dayStr);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                className={[
                  "min-h-[48px] p-1 border-b border-line/40 flex flex-col items-center select-none",
                  isLastRow ? "border-b-0" : "",
                  !isCurrentMonth ? "opacity-20" : "",
                  bg,
                  notClickable ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                <div className={[
                  "w-7 h-7 flex items-center justify-center rounded-full font-mono text-xs transition-colors",
                  isCheckIn || isCheckOut ? "bg-amber text-bg font-bold" : "",
                  isToday && !isCheckIn && !isCheckOut ? "ring-1 ring-amber text-amber" : "",
                  !isCheckIn && !isCheckOut
                    ? isPast ? "text-mocha/50"
                      : isBlocked && phase === "checkin" ? "text-red-300"
                      : "text-cream-dim"
                    : "",
                ].join(" ")}>
                  {date.getDate()}
                </div>
                {isBlocked && !isPast && !isCheckIn && !isCheckOut && phase === "checkin" && (
                  <span className="font-mono text-[0.48rem] text-red-400/80 leading-tight">booked</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Hint */}
        <div className="border-t border-line px-3 py-2">
          <p className="font-mono text-[0.6rem] text-mocha">
            {phase === "checkin"
              ? "// tap a date to set check-in"
              : `// tap your last night — checkout will be the following morning${cutoff ? ` · latest night: ${addDaysToStr(cutoff, -1)}` : ""}`}
          </p>
        </div>
      </div>
    </div>
  );
}
