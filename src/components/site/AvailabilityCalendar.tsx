"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BlockedRange {
  check_in: string;
  check_out: string;
  source: string;
}

interface Props {
  blocked: BlockedRange[];
  branchSlug: string;
  nightlyRate: number;
  securityDepositPhp?: number;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DEFAULT_SECURITY_DEPOSIT_PHP = 1000;
const PROCESSING_FEE_PHP = Number(process.env.NEXT_PUBLIC_PROCESSING_FEE_PHP ?? "150");

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date | string, n: number): Date {
  const base = typeof d === "string" ? new Date(d) : d;
  return new Date(base.getTime() + n * 86400000);
}

function addDaysStr(ymd: string, n: number): string {
  const d = new Date(ymd);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

function nightsBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function formatPHP(n: number) {
  return `₱${n.toLocaleString("en-PH")}`;
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

export default function AvailabilityCalendar({ blocked, branchSlug, nightlyRate, securityDepositPhp }: Props) {
  const SECURITY_DEPOSIT_PHP = securityDepositPhp ?? DEFAULT_SECURITY_DEPOSIT_PHP;
  const today = new Date();
  const todayStr = toYMD(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

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
    let cur = new Date(r.check_in);
    const end = new Date(r.check_out);
    while (cur < end) {
      const d = toYMD(cur);
      if (!blockedDays.has(d)) blockedDays.set(d, r.source);
      cur = addDays(cur, 1);
    }
  }
  const hasAirbnb = blocked.some((b) => b.source === "airbnb");
  const hasWebsite = blocked.some((b) => b.source !== "airbnb");

  const cutoff = checkIn ? findCutoff(checkIn, blocked) : null;

  function handleClick(dayStr: string, isPast: boolean, isBlocked: boolean) {
    if (isPast) return;

    if (!checkIn) {
      if (isBlocked) return;
      setCheckIn(dayStr);
      setCheckOut(null);
      return;
    }

    if (dayStr === checkIn) {
      setCheckIn(null);
      setCheckOut(null);
      return;
    }
    if (dayStr <= checkIn) {
      if (isBlocked) return;
      setCheckIn(dayStr);
      setCheckOut(null);
      return;
    }
    // Blocked date == cutoff is allowed as checkout-only; blocked dates after cutoff are not
    if (isBlocked && dayStr !== cutoff) return;
    if (cutoff && dayStr > cutoff) return;
    setCheckOut(dayStr);
  }

  function clear() {
    setCheckIn(null);
    setCheckOut(null);
    setHoverDate(null);
  }

  // Range end: hover or confirmed checkout (direct departure-date semantics)
  const rangeEnd = checkIn && !checkOut ? hoverDate : checkOut;

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const accommodation = nights * nightlyRate;
  const total = accommodation + SECURITY_DEPOSIT_PHP + PROCESSING_FEE_PHP;

  function isInRange(dayStr: string) {
    if (!checkIn || !rangeEnd) return false;
    return dayStr > checkIn && dayStr < rangeEnd;
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
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="h-8 flex items-center justify-center font-mono text-[0.58rem] uppercase tracking-widest text-mocha">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const dayStr = toYMD(date);
            const isCurrentMonth = date.getMonth() === gridMonth;
            const isToday = dayStr === todayStr;
            const isPast = dayStr < todayStr;
            const isBlocked = blockedDays.has(dayStr);
            const blockedSrc = blockedDays.get(dayStr);
            const isCheckIn = dayStr === checkIn;
            const isCheckOut = dayStr === checkOut;
            const inRange = isInRange(dayStr);
            const isHoverTarget = !checkOut && dayStr === hoverDate && !isCheckIn;
            const isCheckoutOnly = !!checkIn && !checkOut && isBlocked && dayStr === cutoff;

            const disabled =
              isPast ||
              (!checkIn && isBlocked) ||
              (!!checkIn && dayStr !== checkIn && dayStr > checkIn &&
               ((isBlocked && dayStr !== cutoff) || (!!cutoff && dayStr > cutoff)));

            // Half-pill bg for range endpoints
            const rangeRight = isCheckIn && isInRange(addDaysStr(dayStr, 1));
            const rangeLeft = isCheckOut && isInRange(addDaysStr(dayStr, -1));

            return (
              <div
                key={dayStr + i}
                onClick={() => isCurrentMonth && handleClick(dayStr, isPast, isBlocked)}
                onMouseEnter={() => {
                  if (checkIn && !checkOut && isCurrentMonth && !isPast && dayStr > checkIn && !(cutoff && dayStr > cutoff) && (!isBlocked || dayStr === cutoff)) {
                    setHoverDate(dayStr);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                className={[
                  "h-10 flex items-center justify-center relative select-none group",
                  !isCurrentMonth ? "opacity-0 pointer-events-none" : "",
                  disabled && !isCheckoutOnly && isCurrentMonth ? "cursor-not-allowed" : "cursor-pointer",
                  inRange ? "bg-amber/10" : "",
                ].join(" ")}
              >
                {rangeRight && <span className="absolute inset-y-0 right-0 w-1/2 bg-amber/10 pointer-events-none" />}
                {rangeLeft && <span className="absolute inset-y-0 left-0 w-1/2 bg-amber/10 pointer-events-none" />}

                {isCheckoutOnly && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-bg-card border border-line text-cream-dim font-mono text-[0.55rem] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    checkout only
                  </span>
                )}

                <div className={[
                  "w-9 h-9 flex items-center justify-center rounded-full font-mono text-sm transition-colors z-10 relative overflow-hidden",
                  isCheckIn || isCheckOut ? "bg-cream text-bg font-bold" : "",
                  isHoverTarget ? "bg-cream/15 ring-1 ring-cream/30 text-cream" : "",
                  isToday && !isCheckIn && !isCheckOut && !isHoverTarget ? "ring-1 ring-amber text-amber font-semibold" : "",
                  !isCheckIn && !isCheckOut
                    ? isCheckoutOnly
                      ? "text-mocha/50 line-through group-hover:text-cream-dim group-hover:no-underline"
                      : disabled
                      ? "text-mocha/30"
                      : isBlocked
                        ? "text-mocha"
                        : isHoverTarget
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
    <div className="border border-line-bright rounded-xl bg-bg-card overflow-hidden">
      {/* Phase title */}
      <div className="px-5 pt-4 pb-2">
        <h3 className="font-display font-bold text-cream text-lg">
          {!checkIn
            ? "Select check-in date"
            : !checkOut
              ? "Select checkout date"
              : "Dates selected"}
        </h3>
        <p className="font-mono text-[0.62rem] text-mocha mt-0.5">
          {!checkIn
            ? "Add your travel dates for exact pricing"
            : !checkOut
              ? `check-in ${checkIn}${cutoff ? ` · latest checkout: ${cutoff}` : ""}`
              : `${checkIn} → ${checkOut} · ${nights} ${nights === 1 ? "night" : "nights"}`}
        </p>
      </div>

      {/* Month headers */}
      <div className="grid grid-cols-2 border-b border-t border-line mt-2">
        <div className="flex items-center gap-2 px-4 py-2.5 border-r border-line/40">
          <button onClick={prevMonth} className="p-1 rounded text-cream-dim hover:text-cream hover:bg-bg-elev transition" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="flex-1 text-center font-display font-bold text-cream text-sm">
            {MONTHS[month]} {year}
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5">
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
          {!checkIn
            ? "// tap a date to set check-in"
            : !checkOut
              ? `// tap your checkout date${cutoff ? ` · latest checkout: ${cutoff}` : ""}`
              : `// ${checkIn} → ${checkOut}`}
        </p>
        <button
          onClick={clear}
          className="font-mono text-[0.65rem] text-cream-dim underline underline-offset-2 hover:text-cream transition"
        >
          Clear dates
        </button>
      </div>

      {/* Legend — matches the booking calendar */}
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

      {/* Booking summary */}
      {checkIn && checkOut && (
        <div className="border-t border-line px-4 py-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-mocha uppercase tracking-widest">Check-in</span>
            <span className="text-cream">{checkIn}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-mocha uppercase tracking-widest">Check-out</span>
            <span className="text-cream">{checkOut}</span>
          </div>
          {nightlyRate > 0 && (
            <>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-mocha uppercase tracking-widest">
                  {nights} {nights === 1 ? "night" : "nights"} × {formatPHP(nightlyRate)}
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
              <p className="font-mono text-[0.58rem] text-mocha">
                // security deposit refundable · total may vary by guest count
              </p>
            </>
          )}
          <Link
            href={`/playcation/${branchSlug}/book?checkIn=${checkIn}&checkOut=${checkOut}`}
            className="block w-full key-cap key-cap-primary justify-center text-center mt-1"
          >
            Book now
          </Link>
        </div>
      )}
    </div>
  );
}
