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

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date | string, n: number): string {
  const base = typeof d === "string" ? new Date(d) : d;
  return toYMD(new Date(base.getTime() + n * 86400000));
}

function findCutoff(from: string, blocked: BlockedRange[]): string | null {
  let cutoff: string | null = null;
  for (const r of blocked) {
    if (r.check_in > from && (!cutoff || r.check_in < cutoff)) cutoff = r.check_in;
    if (r.check_in <= from && r.check_out > from) {
      if (!cutoff || r.check_out < cutoff) cutoff = r.check_out;
    }
  }
  return cutoff;
}

export default function BookingCalendar({ blocked, checkIn, checkOut, onChange }: Props) {
  const today = new Date();
  const todayStr = toYMD(today);

  const [year, setYear] = useState(() => {
    const d = new Date(checkIn);
    return isNaN(d.getTime()) ? today.getFullYear() : d.getFullYear();
  });
  const [month, setMonth] = useState(() => {
    const d = new Date(checkIn);
    return isNaN(d.getTime()) ? today.getMonth() : d.getMonth();
  });
  // "checkin" = waiting for check-in click, "checkout" = waiting for check-out click
  const [phase, setPhase] = useState<"checkin" | "checkout">("checkin");
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstOfMonth.getDay();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const base = new Date(year, month, 1);
    cells.push(new Date(base.getTime() + (i - startOffset) * 86400000));
  }

  const blockedDays = new Set<string>();
  for (const r of blocked) {
    let cur = new Date(r.check_in);
    const end = new Date(r.check_out);
    while (cur < end) {
      blockedDays.add(toYMD(cur));
      cur = new Date(cur.getTime() + 86400000);
    }
  }

  const cutoff = phase === "checkout" ? findCutoff(checkIn, blocked) : null;

  function handleClick(dayStr: string, isPast: boolean) {
    const isBlocked = blockedDays.has(dayStr);

    if (phase === "checkin") {
      if (isPast || isBlocked) return;
      onChange({ checkIn: dayStr, checkOut: addDays(dayStr, 1) });
      setPhase("checkout");
      return;
    }

    // checkout phase
    if (dayStr === checkIn) {
      // clicking check-in again → reset
      setPhase("checkin");
      return;
    }
    if (dayStr <= checkIn) {
      // earlier date → restart as new check-in
      if (isPast || isBlocked) return;
      onChange({ checkIn: dayStr, checkOut: addDays(dayStr, 1) });
      setPhase("checkout");
      return;
    }
    if (cutoff && dayStr > cutoff) return;
    onChange({ checkIn, checkOut: dayStr });
    setPhase("checkin");
  }

  const rangeEnd = phase === "checkout" && !hoverDate ? checkOut : (phase === "checkout" ? hoverDate : checkOut);

  function isInRange(dayStr: string) {
    const lo = checkIn;
    const hi = rangeEnd;
    if (!lo || !hi) return false;
    const [a, b] = lo < hi ? [lo, hi] : [hi, lo];
    return dayStr > a && dayStr < b;
  }

  return (
    <div>
      {/* Phase indicator */}
      <div className="mb-3 flex items-center gap-3 font-mono text-[0.7rem]">
        <button
          onClick={() => setPhase("checkin")}
          className={`px-3 py-1.5 rounded-md border transition ${
            phase === "checkin"
              ? "border-amber/60 bg-amber/10 text-amber"
              : "border-line-bright text-cream-dim hover:border-amber/30"
          }`}
        >
          CHECK-IN: <span className="font-bold">{checkIn}</span>
        </button>
        <span className="text-mocha">→</span>
        <button
          onClick={() => setPhase("checkout")}
          className={`px-3 py-1.5 rounded-md border transition ${
            phase === "checkout"
              ? "border-amber/60 bg-amber/10 text-amber"
              : "border-line-bright text-cream-dim hover:border-amber/30"
          }`}
        >
          CHECK-OUT: <span className="font-bold">{checkOut}</span>
        </button>
      </div>

      <div className="border border-line-bright rounded-xl bg-bg overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-md text-cream-dim hover:text-cream hover:bg-bg-elev transition"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-display font-bold text-cream text-sm">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-md text-cream-dim hover:text-cream hover:bg-bg-elev transition"
            aria-label="Next month"
          >
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
            const isCheckIn = dayStr === checkIn;
            const isCheckOut = dayStr === checkOut;
            const inRange = isInRange(dayStr);
            const isLastRow = i >= totalCells - 7;

            const disabledInPhase2 = phase === "checkout" && cutoff && dayStr > cutoff;
            const notClickable = isPast || (phase === "checkin" && isBlocked) || !!disabledInPhase2;

            let bg = "";
            if (isCheckIn || isCheckOut) bg = "bg-amber/25";
            else if (inRange) bg = "bg-amber/10";
            else if (isBlocked && !isPast && phase === "checkin") bg = "bg-red-500/10";

            return (
              <div
                key={dayStr}
                onClick={() => isCurrentMonth && handleClick(dayStr, isPast)}
                onMouseEnter={() => {
                  if (phase === "checkout" && !isPast) setHoverDate(dayStr);
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
                <div
                  className={[
                    "w-7 h-7 flex items-center justify-center rounded-full font-mono text-xs transition-colors",
                    isCheckIn || isCheckOut ? "bg-amber text-bg font-bold" : "",
                    isToday && !isCheckIn && !isCheckOut ? "ring-1 ring-amber text-amber" : "",
                    !isCheckIn && !isCheckOut
                      ? isPast
                        ? "text-mocha/50"
                        : isBlocked && phase === "checkin"
                          ? "text-red-300"
                          : "text-cream-dim"
                      : "",
                  ].join(" ")}
                >
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
              : `// check-in set · now tap check-out date${cutoff ? ` (before ${cutoff})` : ""}`}
          </p>
        </div>
      </div>
    </div>
  );
}
