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
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}

export default function AvailabilityCalendar({ blocked }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
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
  const todayStr = toYMD(today);
  for (const r of blocked) {
    let cur = new Date(r.check_in);
    const end = new Date(r.check_out);
    while (cur < end) {
      blockedDays.add(toYMD(cur));
      cur = addDays(cur, 1);
    }
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
        {DAYS.map((d) => (
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

          return (
            <div
              key={dayStr}
              className={`min-h-[52px] p-1.5 border-b border-line/40 flex flex-col items-center
                ${isLastRow ? "border-b-0" : ""}
                ${!isCurrentMonth ? "opacity-20" : ""}
                ${isBlocked && !isPast ? "bg-red-500/10" : ""}
              `}
            >
              <div
                className={`w-7 h-7 flex items-center justify-center rounded-full font-mono text-xs
                  ${isToday ? "bg-amber text-bg font-bold" : ""}
                  ${isPast ? "text-mocha/50" : isBlocked ? "text-red-300" : "text-cream-dim"}
                `}
              >
                {date.getDate()}
              </div>
              {isBlocked && !isPast && (
                <span className="font-mono text-[0.5rem] text-red-400/80 mt-0.5">booked</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="border-t border-line px-4 py-2 flex items-center gap-5">
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
  );
}
