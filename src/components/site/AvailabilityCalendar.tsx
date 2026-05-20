"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface BlockedRange {
  check_in: string;
  check_out: string;
  source: string;
}

interface Props {
  blocked: BlockedRange[];
  branchSlug: string;
  nightlyRate: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SECURITY_DEPOSIT_PHP = 1000;
const PROCESSING_FEE_PHP = Number(
  process.env.NEXT_PUBLIC_PROCESSING_FEE_PHP ?? "150",
);

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date | string, n: number): Date {
  const base = typeof d === "string" ? new Date(d) : d;
  return new Date(base.getTime() + n * 86400000);
}
function nightsBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
function formatPHP(n: number) {
  return `₱${n.toLocaleString("en-PH")}`;
}

// First blocked check_in strictly after `from` — the checkout boundary
function findCutoff(from: string, blocked: BlockedRange[]): string | null {
  let cutoff: string | null = null;
  for (const r of blocked) {
    if (r.check_in > from && (!cutoff || r.check_in < cutoff)) {
      cutoff = r.check_in;
    }
    // Range that started before/on `from` but ends after it
    if (r.check_in <= from && r.check_out > from) {
      // `from` itself is inside this block — shouldn't happen since we
      // prevent clicking blocked days, but guard anyway
      if (!cutoff || r.check_out < cutoff) cutoff = r.check_out;
    }
  }
  return cutoff;
}

export default function AvailabilityCalendar({ blocked, branchSlug, nightlyRate }: Props) {
  const today = new Date();
  const todayStr = toYMD(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
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
    cells.push(addDays(new Date(year, month, 1 - startOffset), i));
  }

  // Build blocked day set
  const blockedDays = new Set<string>();
  for (const r of blocked) {
    let cur = new Date(r.check_in);
    const end = new Date(r.check_out);
    while (cur < end) {
      blockedDays.add(toYMD(cur));
      cur = addDays(cur, 1);
    }
  }

  const cutoff = checkIn ? findCutoff(checkIn, blocked) : null;

  function handleClick(dayStr: string, isPast: boolean, isBlocked: boolean) {
    if (isPast) return;

    if (!checkIn) {
      // Phase 1: pick check-in (blocked days not allowed)
      if (isBlocked) return;
      setCheckIn(dayStr);
      setCheckOut(null);
      return;
    }

    // Phase 2: pick check-out
    if (dayStr === checkIn) {
      // Deselect
      setCheckIn(null);
      setCheckOut(null);
      return;
    }
    if (dayStr <= checkIn) {
      // Earlier date — start over with new check-in
      if (isBlocked) return;
      setCheckIn(dayStr);
      setCheckOut(null);
      return;
    }
    // After check-in — validate cutoff
    if (cutoff && dayStr > cutoff) return;
    setCheckOut(dayStr);
  }

  function clear() {
    setCheckIn(null);
    setCheckOut(null);
    setHoverDate(null);
  }

  // Range end for highlighting (hover preview or confirmed checkout)
  const rangeEnd = checkIn && !checkOut ? hoverDate : checkOut;

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const accommodation = nights * nightlyRate;
  const total = accommodation + SECURITY_DEPOSIT_PHP + PROCESSING_FEE_PHP;

  function isInRange(dayStr: string) {
    if (!checkIn || !rangeEnd) return false;
    const lo = checkIn < rangeEnd ? checkIn : rangeEnd;
    const hi = checkIn < rangeEnd ? rangeEnd : checkIn;
    return dayStr > lo && dayStr < hi;
  }

  function isDisabledInPhase2(dayStr: string, isPast: boolean) {
    if (!checkIn) return false;
    if (isPast) return true;
    if (cutoff && dayStr > cutoff) return true;
    return false;
  }

  return (
    <div className="border border-line-bright rounded-xl bg-bg-card overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-md text-cream-dim hover:text-cream hover:bg-bg-elev transition"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-display font-bold text-cream">
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
          <div key={d} className="py-2 text-center font-mono text-[0.6rem] uppercase tracking-widest text-mocha">
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
          const isLastRow = i >= totalCells - 7;
          const isCheckIn = dayStr === checkIn;
          const isCheckOut = dayStr === checkOut;
          const inRange = isInRange(dayStr);
          const disabled = isPast || isDisabledInPhase2(dayStr, isPast) || (!checkIn && isBlocked);
          const phase2BlockedOk = checkIn && isBlocked && cutoff && dayStr <= cutoff; // blocked but valid checkout boundary

          let bg = "";
          if (isCheckIn || isCheckOut) bg = "bg-amber/30";
          else if (inRange) bg = "bg-amber/10";
          else if (isBlocked && !isPast && !phase2BlockedOk) bg = "bg-red-500/10";

          let cursor = "cursor-default";
          if (!isPast && !disabled) cursor = "cursor-pointer";
          if (disabled && !isPast) cursor = "cursor-not-allowed";

          return (
            <div
              key={dayStr}
              onClick={() => handleClick(dayStr, isPast, isBlocked && !phase2BlockedOk)}
              onMouseEnter={() => {
                if (checkIn && !checkOut) setHoverDate(dayStr);
              }}
              onMouseLeave={() => setHoverDate(null)}
              className={`min-h-[52px] p-1.5 border-b border-line/40 flex flex-col items-center select-none
                ${isLastRow ? "border-b-0" : ""}
                ${!isCurrentMonth ? "opacity-20" : ""}
                ${bg}
                ${cursor}
                ${disabled && isCurrentMonth ? "opacity-40" : ""}
              `}
            >
              <div
                className={`w-7 h-7 flex items-center justify-center rounded-full font-mono text-xs transition-colors
                  ${isCheckIn || isCheckOut ? "bg-amber text-bg font-bold" : ""}
                  ${isToday && !isCheckIn && !isCheckOut ? "ring-1 ring-amber text-amber" : ""}
                  ${isPast ? "text-mocha/50" : isBlocked && !phase2BlockedOk ? "text-red-300" : "text-cream-dim"}
                `}
              >
                {date.getDate()}
              </div>
              {isBlocked && !isPast && !phase2BlockedOk && !isCheckIn && !isCheckOut && (
                <span className="font-mono text-[0.5rem] text-red-400/80 mt-0.5">booked</span>
              )}
              {isCheckIn && (
                <span className="font-mono text-[0.5rem] text-amber mt-0.5">check-in</span>
              )}
              {isCheckOut && (
                <span className="font-mono text-[0.5rem] text-amber mt-0.5">check-out</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Instruction / summary */}
      {!checkIn && (
        <div className="border-t border-line px-4 py-3 flex items-center gap-5 flex-wrap">
          <p className="font-mono text-[0.65rem] text-cream-dim">
            // tap a date to select check-in
          </p>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-bg border border-line-bright" />
              <span className="font-mono text-[0.6rem] text-cream-dim">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/30" />
              <span className="font-mono text-[0.6rem] text-cream-dim">Booked</span>
            </div>
          </div>
        </div>
      )}

      {checkIn && !checkOut && (
        <div className="border-t border-line px-4 py-3 flex items-center justify-between gap-4">
          <p className="font-mono text-[0.65rem] text-amber">
            // check-in {checkIn} — now tap a check-out date
          </p>
          <button onClick={clear} className="text-cream-dim hover:text-cream">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {checkIn && checkOut && (
        <div className="border-t border-line px-4 py-4 space-y-3">
          {/* Summary rows */}
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-mocha uppercase tracking-widest">Check-in</span>
            <span className="text-cream">{checkIn}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-mocha uppercase tracking-widest">Check-out</span>
            <span className="text-cream">{checkOut}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-mocha uppercase tracking-widest">Nights</span>
            <span className="text-cream">{nights}</span>
          </div>
          {nightlyRate > 0 && (
            <>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-mocha uppercase tracking-widest">
                  Accommodation ({nights} × {formatPHP(nightlyRate)})
                </span>
                <span className="text-cream">{formatPHP(accommodation)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-mocha uppercase tracking-widest">Security deposit</span>
                <span className="text-cream">{formatPHP(SECURITY_DEPOSIT_PHP)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-mocha uppercase tracking-widest">Processing fee</span>
                <span className="text-cream">{formatPHP(PROCESSING_FEE_PHP)}</span>
              </div>
              <div className="border-t border-line pt-2 flex items-center justify-between font-mono">
                <span className="text-cream text-xs uppercase tracking-widest font-bold">Estimated total</span>
                <span className="text-amber font-bold">{formatPHP(total)}</span>
              </div>
              <p className="font-mono text-[0.6rem] text-mocha">
                // security deposit is refundable · final total may vary by guest count
              </p>
            </>
          )}
          <div className="flex items-center gap-3 pt-1">
            <Link
              href={`/playcation/${branchSlug}/book?checkIn=${checkIn}&checkOut=${checkOut}`}
              className="flex-1 key-cap key-cap-primary justify-center text-center"
            >
              Book now
            </Link>
            <button
              onClick={clear}
              className="key-cap"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
