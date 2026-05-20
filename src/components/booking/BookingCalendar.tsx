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

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  let cutoff: string | null = null;
  for (const r of blocked) {
    if (r.check_in > from && (!cutoff || r.check_in < cutoff)) cutoff = r.check_in;
  }
  return cutoff;
}

export default function BookingCalendar({ blocked, checkIn, checkOut, onChange }: Props) {
  const today = new Date();
  const todayStr = toYMD(today);

  const [pendingIn, setPendingIn] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date(checkIn).getFullYear());
  const [month, setMonth] = useState(() => new Date(checkIn).getMonth());
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const phase: "checkin" | "checkout" = pendingIn ? "checkout" : "checkin";
  const displayCheckIn = pendingIn ?? checkIn;

  // Right month = left + 1
  const rightMonth = month === 11 ? 0 : month + 1;
  const rightYear = month === 11 ? year + 1 : year;

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const blockedDays = new Map<string, string>(); // date → source
  for (const r of blocked) {
    const end = new Date(r.check_out);
    let cur = new Date(r.check_in);
    while (cur < end) {
      const d = toYMD(cur);
      if (!blockedDays.has(d)) blockedDays.set(d, r.source);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const cutoff = pendingIn ? findCutoff(pendingIn, blocked) : null;
  const hasAirbnb = blocked.some(b => b.source === "airbnb");
  const hasWebsite = blocked.some(b => b.source !== "airbnb");

  function handleClick(dayStr: string, isPast: boolean) {
    const isBlocked = blockedDays.has(dayStr);

    if (phase === "checkin") {
      if (isPast || isBlocked) return;
      setPendingIn(dayStr);
      return;
    }

    if (dayStr === pendingIn) { setPendingIn(null); return; }
    if (dayStr < pendingIn!) return;
    if (isPast) return;
    // Blocked dates after cutoff are fully disabled; blocked date == cutoff is "checkout only"
    if (isBlocked && dayStr !== cutoff) return;
    if (cutoff && dayStr > cutoff) return;

    onChange({ checkIn: pendingIn!, checkOut: dayStr });
    setPendingIn(null);
  }

  const rangeStart = displayCheckIn;
  const rangeEnd = phase === "checkout"
    ? (hoverDate && hoverDate > rangeStart ? hoverDate : null)
    : checkOut;

  function isInRange(dayStr: string) {
    if (!rangeStart || !rangeEnd) return false;
    return dayStr > rangeStart && dayStr < rangeEnd;
  }

  function renderMonth(gridYear: number, gridMonth: number) {
    const daysInMonth = new Date(gridYear, gridMonth + 1, 0).getDate();
    const startOffset = new Date(gridYear, gridMonth, 1).getDay();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const cells: Date[] = [];
    for (let i = 0; i < totalCells; i++) {
      cells.push(new Date(gridYear, gridMonth, 1 - startOffset + i));
    }

    return (
      <div>
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="h-8 flex items-center justify-center font-mono text-[0.58rem] uppercase tracking-widest text-mocha">
              {d}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const dayStr = toYMD(date);
            const isCurrentMonth = date.getMonth() === gridMonth;
            const isToday = dayStr === todayStr;
            const isPast = dayStr < todayStr;
            const isBlocked = blockedDays.has(dayStr);
            const blockedSrc = blockedDays.get(dayStr);
            const isCheckIn = dayStr === displayCheckIn;
            const isCheckOut = phase === "checkin" && dayStr === checkOut;
            const inRange = isInRange(dayStr);

            // "checkout only" = the first blocked date after pendingIn (cutoff itself)
            const isCheckoutOnly = phase === "checkout" && isBlocked && dayStr === cutoff;
            const disabledInPhase2 =
              phase === "checkout" &&
              (isPast || dayStr < pendingIn! || (!!cutoff && dayStr > cutoff) ||
               (isBlocked && dayStr !== cutoff));
            const notClickable = !isCurrentMonth || isPast || (phase === "checkin" && isBlocked) || !!disabledInPhase2;

            // Half-background for range pill effect on endpoints
            const rangeRight = isCheckIn && isInRange(addDaysToStr(dayStr, 1));
            const rangeLeft = isCheckOut && isInRange(addDaysToStr(dayStr, -1));
            const isHovering = phase === "checkout" && dayStr === hoverDate && !isCheckIn;

            return (
              <div
                key={dayStr + i}
                onClick={() => !notClickable && handleClick(dayStr, isPast)}
                onMouseEnter={() => {
                  if (phase === "checkout" && isCurrentMonth && !isPast && dayStr > pendingIn! && !(cutoff && dayStr > cutoff) && (!isBlocked || dayStr === cutoff)) {
                    setHoverDate(dayStr);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                className={[
                  "h-10 flex items-center justify-center relative select-none group",
                  !isCurrentMonth ? "opacity-0 pointer-events-none" : "",
                  notClickable && !isCheckoutOnly ? "cursor-not-allowed" : "cursor-pointer",
                  inRange ? "bg-amber/10" : "",
                ].join(" ")}
              >
                {/* Half-pill bg for range endpoints */}
                {rangeRight && <span className="absolute inset-y-0 right-0 w-1/2 bg-amber/10 pointer-events-none" />}
                {rangeLeft && <span className="absolute inset-y-0 left-0 w-1/2 bg-amber/10 pointer-events-none" />}

                {/* "Checkout only" tooltip */}
                {isCheckoutOnly && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-bg-card border border-line text-cream-dim font-mono text-[0.55rem] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    checkout only
                  </span>
                )}

                <div className={[
                  "w-9 h-9 flex items-center justify-center rounded-full font-mono text-sm transition-colors z-10 relative overflow-hidden",
                  isCheckIn || isCheckOut
                    ? "bg-cream text-bg font-bold"
                    : "",
                  isHovering
                    ? "bg-cream/15 ring-1 ring-cream/30 text-cream"
                    : "",
                  isToday && !isCheckIn && !isCheckOut && !isHovering
                    ? "ring-1 ring-amber text-amber font-semibold"
                    : "",
                  !isCheckIn && !isCheckOut
                    ? isCheckoutOnly
                      ? "text-mocha/50 line-through group-hover:text-cream-dim group-hover:no-underline"
                      : isBlocked && !isPast
                      ? "text-mocha"
                      : notClickable
                      ? "text-mocha/30"
                      : isHovering
                        ? ""
                        : "text-cream-dim hover:bg-bg-elev"
                    : "",
                ].join(" ")}>
                  {date.getDate()}
                  {isBlocked && !isCheckIn && !isCheckOut && !isCheckoutOnly && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                      <span className={`block h-px w-[140%] rotate-[-45deg] ${blockedSrc === "airbnb" ? "bg-amber/70" : "bg-red-400/60"}`} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Phase title */}
      <div className="mb-4">
        <h3 className="font-display font-bold text-cream text-xl">
          {phase === "checkin" ? "Select check-in date" : "Select checkout date"}
        </h3>
        <p className="font-mono text-[0.68rem] text-mocha mt-1">
          {phase === "checkin"
            ? `check-in: ${checkIn} · check-out: ${checkOut}`
            : `checking in ${displayCheckIn}${cutoff ? ` · latest checkout: ${cutoff}` : ""}`}
        </p>
      </div>

      <div className="border border-line-bright rounded-xl bg-bg overflow-hidden">
        {/* Month headers with nav arrows */}
        <div className="grid grid-cols-2 border-b border-line">
          {/* Left month */}
          <div className="flex items-center gap-2 px-4 py-3 border-r border-line/40">
            <button onClick={prevMonth} className="p-1 rounded text-cream-dim hover:text-cream hover:bg-bg-elev transition" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex-1 text-center font-display font-bold text-cream text-sm">
              {MONTHS[month]} {year}
            </span>
          </div>
          {/* Right month */}
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="flex-1 text-center font-display font-bold text-cream text-sm">
              {MONTHS[rightMonth]} {rightYear}
            </span>
            <button onClick={nextMonth} className="p-1 rounded text-cream-dim hover:text-cream hover:bg-bg-elev transition" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Two month grids */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line/30 px-4 py-3">
          {renderMonth(year, month)}
          {renderMonth(rightYear, rightMonth)}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-4 py-2.5 flex items-center justify-between">
          <p className="font-mono text-[0.58rem] text-mocha">
            {phase === "checkin"
              ? "// tap a date to set check-in"
              : `// tap your checkout date${cutoff ? ` · latest checkout: ${cutoff}` : ""}`}
          </p>
          <button
            onClick={() => setPendingIn(null)}
            className="font-mono text-[0.65rem] text-cream-dim underline underline-offset-2 hover:text-cream transition"
          >
            Clear dates
          </button>
        </div>

        {(hasWebsite || hasAirbnb) && (
          <div className="border-t border-line/40 px-4 py-2 flex items-center gap-5">
            {hasWebsite && (
              <span className="flex items-center gap-1.5">
                <span className="relative h-5 w-5 rounded-full border border-line-bright bg-bg overflow-hidden flex items-center justify-center shrink-0">
                  <span className="block h-px w-[150%] rotate-[-45deg] bg-red-400/60" />
                </span>
                <span className="font-mono text-[0.55rem] uppercase tracking-widest text-mocha">booked · website</span>
              </span>
            )}
            {hasAirbnb && (
              <span className="flex items-center gap-1.5">
                <span className="relative h-5 w-5 rounded-full border border-line-bright bg-bg overflow-hidden flex items-center justify-center shrink-0">
                  <span className="block h-px w-[150%] rotate-[-45deg] bg-amber/70" />
                </span>
                <span className="font-mono text-[0.55rem] uppercase tracking-widest text-mocha">booked · airbnb</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
