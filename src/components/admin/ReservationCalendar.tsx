"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CalendarReservation {
  id: string;
  check_in: string;
  check_out: string;
  guest_name: string | null;
  source: string;
  status: string;
  branch_id?: string;
  branch_name?: string;
  member_id?: string | null;
  member_avatar_url?: string | null;
  member_name?: string | null;
}

interface Props {
  reservations: CalendarReservation[];
  showBranch?: boolean;
}

const SOURCE_STYLE: Record<string, { pill: string; dot: string }> = {
  website: {
    pill: "bg-amber/15 text-amber border-amber/30",
    dot: "bg-amber",
  },
  airbnb: {
    pill: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    dot: "bg-rose-400",
  },
  manual: {
    pill: "bg-mocha/20 text-mocha border-mocha/30",
    dot: "bg-mocha",
  },
};

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

function Avatar({ url, name }: { url?: string | null; name?: string | null }) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name ?? ""}
        width={16}
        height={16}
        className="rounded-full w-4 h-4 object-cover shrink-0"
        unoptimized
      />
    );
  }
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="w-4 h-4 rounded-full bg-bg-elev text-[0.5rem] font-mono text-cream-dim flex items-center justify-center shrink-0">
      {initials}
    </span>
  );
}

export default function ReservationCalendar({ reservations, showBranch = false }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<CalendarReservation | null>(null);

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
  const startOffset = firstOfMonth.getDay(); // 0=Sun
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  // Build day cells
  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    cells.push(addDays(new Date(year, month, 1 - startOffset), i));
  }

  // Map each reservation to every day it covers
  const byDay = new Map<string, CalendarReservation[]>();
  for (const r of reservations) {
    if (r.status === "cancelled") continue;
    let cur = new Date(r.check_in);
    const end = new Date(r.check_out);
    while (cur < end) {
      const key = toYMD(cur);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
      cur = addDays(cur, 1);
    }
  }

  const todayStr = toYMD(today);

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
        <span className="font-display font-bold text-cream text-lg">
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
          <div
            key={d}
            className="py-2 text-center font-mono text-[0.6rem] uppercase tracking-widest text-mocha"
          >
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
          const isPast = dayStr < todayStr && !isToday;
          const events = byDay.get(dayStr) ?? [];
          const isLastRow = i >= totalCells - 7;

          return (
            <div
              key={dayStr}
              className={`min-h-[90px] p-1.5 border-b border-line/40 ${isLastRow ? "border-b-0" : ""} ${!isCurrentMonth ? "bg-bg/40" : ""}`}
            >
              {/* Date number */}
              <div
                className={`w-6 h-6 mb-1 flex items-center justify-center rounded-full font-mono text-xs
                  ${isToday ? "bg-amber text-bg font-bold" : ""}
                  ${!isCurrentMonth ? "text-mocha/40" : isPast ? "text-mocha" : "text-cream-dim"}
                `}
              >
                {date.getDate()}
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {events.slice(0, 3).map((r) => {
                  const style = SOURCE_STYLE[r.source] ?? SOURCE_STYLE.manual;
                  const isPending = r.status === "pending_hold";
                  const isCheckIn = r.check_in === dayStr;
                  return (
                    <div
                      key={r.id + dayStr}
                      title={[
                        r.member_name ?? r.guest_name ?? "Guest",
                        r.source,
                        r.status,
                        showBranch ? r.branch_name : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      onClick={() => setSelected(r)}
                      className={`flex items-center gap-1 px-1 py-0.5 rounded border text-[0.58rem] font-mono truncate cursor-pointer hover:brightness-125 transition ${style.pill} ${isPending ? "opacity-50" : ""}`}
                    >
                      {r.source === "website" ? (
                        <Avatar url={r.member_avatar_url} name={r.member_name ?? r.guest_name} />
                      ) : (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                      )}
                      <span className="truncate">
                        {isCheckIn ? "→ " : ""}
                        {showBranch && r.branch_name ? `[${r.branch_name.slice(0, 6)}] ` : ""}
                        {r.member_name ?? r.guest_name ?? "Booked"}
                      </span>
                    </div>
                  );
                })}
                {events.length > 3 && (
                  <div className="font-mono text-[0.55rem] text-mocha px-1">
                    +{events.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="border-t border-line px-4 py-2 flex items-center gap-5 flex-wrap">
        {Object.entries(SOURCE_STYLE).map(([src, s]) => (
          <div key={src} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${s.dot}`} />
            <span className="font-mono text-[0.6rem] text-cream-dim capitalize">{src}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber/30 border border-amber/20" />
          <span className="font-mono text-[0.6rem] text-cream-dim">pending hold</span>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="border-t border-line bg-bg px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {selected.source === "website" && (
                  <Avatar url={selected.member_avatar_url} name={selected.member_name ?? selected.guest_name} />
                )}
                <span className="font-display font-bold text-cream">
                  {selected.member_name ?? selected.guest_name ?? "Guest"}
                </span>
                <span className={`text-[0.65rem] font-mono px-2 py-0.5 rounded border ${SOURCE_STYLE[selected.source]?.pill ?? SOURCE_STYLE.manual.pill}`}>
                  {selected.source}
                </span>
                <span className="font-mono text-[0.65rem] text-mocha">{selected.status}</span>
              </div>
              <div className="font-mono text-xs text-cream-dim">
                {selected.check_in} → {selected.check_out}
                {showBranch && selected.branch_name && (
                  <span className="ml-2 text-mocha">· {selected.branch_name}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-cream-dim hover:text-cream shrink-0 text-xs font-mono"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
