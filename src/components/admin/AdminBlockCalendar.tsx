"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { createManualBlockAction, unblockAction } from "@/app/admin/_actions/calendar";
import type { CalendarReservation } from "@/components/admin/ReservationCalendar";

interface Branch {
  id: string;
  name: string;
}

interface Props {
  branches: Branch[];
  reservations: CalendarReservation[];
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SOURCE_STYLE: Record<string, { dot: string; pill: string; label: string }> = {
  website: { dot: "bg-amber", pill: "bg-amber/15 text-amber border-amber/30", label: "Website" },
  airbnb: { dot: "bg-rose-400", pill: "bg-rose-500/15 text-rose-300 border-rose-500/30", label: "Airbnb" },
  manual_block: { dot: "bg-mocha", pill: "bg-mocha/20 text-mocha border-mocha/30", label: "Blocked" },
};

// Diagonal-slash colors — must match the client calendars (BookingCalendar /
// AvailabilityCalendar) so the admin and customer views read the same.
// website = red, airbnb = amber; manual_block is admin-only (mocha).
const SLASH_STYLE: Record<string, string> = {
  website: "bg-red-400/60",
  airbnb: "bg-amber/70",
  manual_block: "bg-mocha",
};

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Avatar({ url, name }: { url?: string | null; name?: string | null }) {
  const initials = (name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (url) {
    return (
      <Image
        src={url}
        alt={name ?? ""}
        width={40}
        height={40}
        className="rounded-full w-10 h-10 object-cover shrink-0"
        unoptimized
      />
    );
  }
  return (
    <span className="w-10 h-10 rounded-full bg-bg-elev text-sm font-mono text-cream-dim flex items-center justify-center shrink-0">
      {initials}
    </span>
  );
}

type PanelMode = "view" | "confirm_block" | "confirm_unblock" | null;

export default function AdminBlockCalendar({ branches, reservations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [blockStart, setBlockStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [panelRes, setPanelRes] = useState<CalendarReservation | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<{ start: string; end: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const todayStr = toYMD(new Date());
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

  function closePanel() {
    setPanelMode(null);
    setPanelRes(null);
    setConfirmBlock(null);
    setActionError(null);
  }

  // Filter to selected branch only
  const branchRes = reservations.filter(
    r => r.branch_id === branchId && r.status !== "cancelled"
  );

  // Build day → reservations map
  const byDay = new Map<string, CalendarReservation[]>();
  for (const r of branchRes) {
    let cur = new Date(r.check_in);
    const end = new Date(r.check_out);
    while (cur < end) {
      const key = toYMD(cur);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
      cur = new Date(cur.getTime() + 86400000);
    }
  }

  function handleDayClick(dayStr: string, isPast: boolean, isCurrentMonth: boolean) {
    if (!isCurrentMonth) return;
    setActionError(null);

    const events = byDay.get(dayStr) ?? [];

    if (events.length > 0) {
      const first = events[0];
      if (first.source === "manual_block") {
        setBlockStart(null);
        setConfirmBlock(null);
        setPanelRes(first);
        setPanelMode("confirm_unblock");
      } else {
        // Website or Airbnb — show booking detail
        setBlockStart(null);
        setConfirmBlock(null);
        setPanelRes(first);
        setPanelMode("view");
      }
      return;
    }

    if (isPast) return;

    if (!blockStart) {
      closePanel();
      setBlockStart(dayStr);
      return;
    }

    if (dayStr === blockStart) {
      setBlockStart(null);
      return;
    }

    if (dayStr < blockStart) {
      setBlockStart(dayStr);
      return;
    }

    // Clicked end date — check_out = day after the last night
    const d = new Date(dayStr);
    d.setDate(d.getDate() + 1);
    const checkOut = toYMD(d);
    setConfirmBlock({ start: blockStart, end: checkOut });
    setBlockStart(null);
    setPanelMode("confirm_block");
  }

  function submitBlock() {
    if (!confirmBlock) return;
    setActionError(null);
    startTransition(async () => {
      const res = await createManualBlockAction(branchId, confirmBlock.start, confirmBlock.end);
      if (res.error) {
        setActionError(res.error);
      } else {
        closePanel();
        router.refresh();
      }
    });
  }

  function submitUnblock() {
    if (!panelRes) return;
    setActionError(null);
    startTransition(async () => {
      const res = await unblockAction(panelRes.id);
      if (res.error) {
        setActionError(res.error);
      } else {
        closePanel();
        router.refresh();
      }
    });
  }

  const rangeEnd = blockStart
    ? hover && hover > blockStart && !byDay.has(hover) ? hover : null
    : null;

  function isInRange(dayStr: string) {
    if (!blockStart || !rangeEnd) return false;
    return dayStr > blockStart && dayStr < rangeEnd;
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
            const events = byDay.get(dayStr) ?? [];
            const primarySrc = events[0]?.source;
            const isBlockStartDay = dayStr === blockStart;
            const inRange = isInRange(dayStr);
            const isHoverEnd = !!blockStart && dayStr === hover && dayStr > blockStart && !byDay.has(dayStr);

            return (
              <div
                key={dayStr + i}
                onClick={() => handleDayClick(dayStr, isPast, isCurrentMonth)}
                onMouseEnter={() => {
                  if (blockStart && isCurrentMonth && !isPast && dayStr > blockStart && !byDay.has(dayStr)) {
                    setHover(dayStr);
                  }
                }}
                onMouseLeave={() => setHover(null)}
                className={[
                  "min-h-[68px] p-1 flex flex-col items-center gap-0.5 relative select-none",
                  !isCurrentMonth ? "opacity-0 pointer-events-none" : "",
                  isCurrentMonth ? "cursor-pointer" : "",
                  inRange ? "bg-amber/10" : "",
                ].join(" ")}
              >
                <div className={[
                  "w-9 h-9 flex items-center justify-center rounded-full font-mono text-sm transition-colors z-10 relative overflow-hidden",
                  isBlockStartDay ? "bg-cream text-bg font-bold" : "",
                  isHoverEnd ? "bg-cream/15 ring-1 ring-cream/30 text-cream" : "",
                  isToday && !isBlockStartDay && !isHoverEnd ? "ring-1 ring-amber text-amber font-semibold" : "",
                  !isBlockStartDay && !isHoverEnd
                    ? isPast
                      ? "text-mocha/30"
                      : events.length > 0
                        ? "text-mocha"
                        : "text-cream-dim hover:bg-bg-elev"
                    : "",
                ].join(" ")}>
                  {date.getDate()}
                  {events.length > 0 && !isBlockStartDay && !isHoverEnd && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                      <span className={`block h-px w-[140%] rotate-[-45deg] ${SLASH_STYLE[primarySrc] ?? "bg-mocha"}`} />
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
      {/* Branch tabs */}
      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[0.62rem] uppercase tracking-widest text-mocha shrink-0">Branch</span>
        <div className="flex gap-2 flex-wrap">
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => {
                setBranchId(b.id);
                setBlockStart(null);
                closePanel();
              }}
              title={`View calendar for ${b.name}`}
              className={`font-mono text-xs px-3 py-1.5 rounded-md border transition ${
                branchId === b.id
                  ? "border-amber text-amber bg-amber/10"
                  : "border-line text-cream-dim hover:border-cream-dim"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-line-bright rounded-xl bg-bg overflow-hidden">
        {/* Phase hint */}
        <div className="px-5 pt-4 pb-2">
          <h3 className="font-display font-bold text-cream text-lg">
            {blockStart ? "Select last night to block" : "Manage availability"}
          </h3>
          <p className="font-mono text-[0.62rem] text-mocha mt-0.5">
            {blockStart
              ? `blocking from ${blockStart} — click the last night`
              : "Tap a booking to view details · tap a free date to start blocking"}
          </p>
        </div>

        {/* Month nav */}
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

        {/* Two-month grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line/30 px-4 py-3">
          {renderMonth(year, month)}
          {renderMonth(rightYear, rightMonth)}
        </div>

        {/* Legend + cancel */}
        <div className="border-t border-line px-4 py-2 flex items-center gap-5 flex-wrap">
          {Object.entries(SOURCE_STYLE).map(([src, s]) => (
            <div key={src} className="flex items-center gap-1.5">
              <span className="relative h-5 w-5 rounded-full border border-line-bright bg-bg overflow-hidden flex items-center justify-center shrink-0">
                <span className={`block h-px w-[150%] rotate-[-45deg] ${SLASH_STYLE[src] ?? "bg-mocha"}`} />
              </span>
              <span className="font-mono text-[0.6rem] text-cream-dim">{s.label}</span>
            </div>
          ))}
          {blockStart && (
            <button
              onClick={() => setBlockStart(null)}
              title="Cancel the current date selection"
              className="ml-auto font-mono text-[0.65rem] text-cream-dim underline underline-offset-2 hover:text-cream transition"
            >
              Cancel selection
            </button>
          )}
        </div>

        {/* Error */}
        {actionError && (
          <div className="border-t border-rose-500/30 bg-rose-500/5 px-4 py-3 font-mono text-xs text-rose-300">
            // error: {actionError}
          </div>
        )}

        {/* Booking detail panel (website / airbnb) */}
        {panelMode === "view" && panelRes && (
          <div className="border-t border-line bg-bg-card px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                {panelRes.source === "website" && (
                  <Avatar url={panelRes.member_avatar_url} name={panelRes.member_name ?? panelRes.guest_name} />
                )}
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-cream">
                      {panelRes.member_name ?? panelRes.guest_name ?? "Guest"}
                    </span>
                    <span className={`font-mono text-[0.62rem] px-2 py-0.5 rounded border ${SOURCE_STYLE[panelRes.source]?.pill ?? SOURCE_STYLE.manual_block.pill}`}>
                      {panelRes.source}
                    </span>
                    <span className="font-mono text-[0.62rem] text-mocha">{panelRes.status}</span>
                  </div>
                  <p className="font-mono text-xs text-cream-dim">
                    {panelRes.check_in} → {panelRes.check_out}
                  </p>
                </div>
              </div>
              <button onClick={closePanel} title="Close booking detail" className="text-cream-dim hover:text-cream text-xs font-mono shrink-0">✕</button>
            </div>

            {/* Actions */}
            <div className="mt-3 flex gap-2 flex-wrap">
              <Link
                href={`/admin/bookings/${panelRes.id}`}
                title="View full booking details"
                className="flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 border border-line rounded-md text-cream-dim hover:text-cream hover:border-cream-dim transition"
              >
                <ExternalLink className="h-3 w-3" />
                View booking
              </Link>
              {panelRes.source === "website" && (
                <Link
                  href="/admin/chat"
                  title="Message this guest in chat"
                  className="flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 border border-amber/40 bg-amber/10 rounded-md text-amber hover:bg-amber/20 transition"
                >
                  <MessageSquare className="h-3 w-3" />
                  Message
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Confirm block panel */}
        {panelMode === "confirm_block" && confirmBlock && (
          <div className="border-t border-line bg-bg-card px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display font-bold text-cream">
                  Block {confirmBlock.start} → {confirmBlock.end}?
                </p>
                <p className="font-mono text-xs text-mocha mt-0.5">
                  These dates will be unavailable to guests.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={closePanel}
                  disabled={isPending}
                  title="Cancel and close this dialog"
                  className="font-mono text-xs text-cream-dim hover:text-cream px-3 py-1.5 border border-line rounded-md transition disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={submitBlock}
                  disabled={isPending}
                  title="Confirm and block these dates"
                  className="font-mono text-xs bg-cream text-bg px-3 py-1.5 rounded-md hover:bg-cream/90 transition flex items-center gap-1.5 disabled:opacity-40"
                >
                  {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Block dates
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm unblock panel */}
        {panelMode === "confirm_unblock" && panelRes && (
          <div className="border-t border-line bg-bg-card px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display font-bold text-cream">Remove this block?</p>
                <p className="font-mono text-xs text-mocha mt-0.5">
                  {panelRes.check_in} → {panelRes.check_out}
                  {panelRes.guest_name && panelRes.guest_name !== "Manual block"
                    ? ` · ${panelRes.guest_name}` : ""}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={closePanel}
                  disabled={isPending}
                  title="Cancel and close this dialog"
                  className="font-mono text-xs text-cream-dim hover:text-cream px-3 py-1.5 border border-line rounded-md transition disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={submitUnblock}
                  disabled={isPending}
                  title="Confirm and remove this date block"
                  className="font-mono text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1.5 rounded-md hover:bg-rose-500/30 transition flex items-center gap-1.5 disabled:opacity-40"
                >
                  {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Unblock
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
