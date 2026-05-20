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

  const blockedDays = new Set<string>();
  for (const r of blocked) {
    const end = new Date(r.check_out);
    let cur = new Date(r.check_in);
    while (cur < end) {
      blockedDays.add(toYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }

  const cutoff = pendingIn ? findCutoff(pendingIn, blocked) : null;

  function handleClick(dayStr: string, isPast: boolean) {
    const isBlocked = blockedDays.has(dayStr);

    if (phase === "checkin") {
      if (isPast || isBlocked) return;
      setPendingIn(dayStr);
      return;
    }

    if (dayStr === pendingIn) { setPendingIn(null); return; }
    if (dayStr < pendingIn!) return;
    if (isPast || isBlocked) return;
    if (cutoff && dayStr >= cutoff) return;

    onChange({ checkIn: pendingIn!, checkOut: addDaysToStr(dayStr, 1) });
    setPendingIn(null);
  }

  const rangeStart = displayCheckIn;
  const rangeEnd = phase === "checkout"
    ? (hoverDate && hoverDate > rangeStart ? addDaysToStr(hoverDate, 1) : null)
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
            const isCheckIn = dayStr === displayCheckIn;
            const isCheckOut = phase === "checkin" && dayStr === checkOut;
            const inRange = isInRange(dayStr);

            const disabledInPhase2 =
              phase === "checkout" &&
              (isPast || isBlocked || dayStr < pendingIn! || (!!cutoff && dayStr >= cutoff));
            const notClickable = !isCurrentMonth || isPast || (phase === "checkin" && isBlocked) || !!disabledInPhase2;

            // Half-background for range pill effect on endpoints
            const rangeRight = isCheckIn && isInRange(addDaysToStr(dayStr, 1));
            const rangeLeft = isCheckOut && isInRange(addDaysToStr(dayStr, -1));

            return (
              <div
                key={dayStr + i}
                onClick={() => !notClickable && handleClick(dayStr, isPast)}
                onMouseEnter={() => {
                  if (phase === "checkout" && isCurrentMonth && !isPast && !isBlocked && dayStr >= pendingIn! && !(cutoff && dayStr >= cutoff)) {
                    setHoverDate(dayStr);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                className={[
                  "h-10 flex items-center justify-center relative select-none",
                  !isCurrentMonth ? "opacity-0 pointer-events-none" : "",
                  notClickable ? "cursor-not-allowed" : "cursor-pointer",
                  inRange ? "bg-amber/10" : "",
                ].join(" ")}
              >
                {/* Half-pill bg for range endpoints */}
                {rangeRight && <span className="absolute inset-y-0 right-0 w-1/2 bg-amber/10 pointer-events-none" />}
                {rangeLeft && <span className="absolute inset-y-0 left-0 w-1/2 bg-amber/10 pointer-events-none" />}

                <div className={[
                  "w-9 h-9 flex items-center justify-center rounded-full font-mono text-sm transition-colors z-10 relative",
                  isCheckIn || isCheckOut
                    ? "bg-cream text-bg font-bold"
                    : "",
                  phase === "checkout" && dayStr === hoverDate && !isCheckIn
                    ? "bg-cream/15 ring-1 ring-cream/30 text-cream"
                    : "",
                  isToday && !isCheckIn && !isCheckOut && !(phase === "checkout" && dayStr === hoverDate)
                    ? "ring-1 ring-amber text-amber font-semibold"
                    : "",
                  !isCheckIn && !isCheckOut
                    ? notClickable
                      ? "text-mocha/30"
                      : isBlocked && phase === "checkin"
                        ? "text-mocha/30 line-through"
                        : phase === "checkout" && dayStr === hoverDate
                          ? ""
                          : "text-cream-dim hover:bg-bg-elev"
                    : "",
                ].join(" ")}>
                  {date.getDate()}
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
            ? `checked in: ${checkIn} · checking out: ${checkOut}`
            : `checking in ${displayCheckIn}${cutoff ? ` · latest checkout: ${cutoff}` : " · tap your last night"}`}
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
              : `// tap your last night — checkout = following morning${cutoff ? ` · latest: ${addDaysToStr(cutoff, -1)}` : ""}`}
          </p>
          <button
            onClick={() => setPendingIn(null)}
            className="font-mono text-[0.65rem] text-cream-dim underline underline-offset-2 hover:text-cream transition"
          >
            Clear dates
          </button>
        </div>
      </div>
    </div>
  );
}
