"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Cpu,
  LayoutGrid,
  Map,
  Power,
  RefreshCw,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { PCStation } from "@/lib/pc-stations";
import PCFloorMap from "./PCFloorMap";

interface Props {
  branchId: string;
  branchSlug: string;
  initialStations: PCStation[];
  initialSyncedAt: string | null;
}

/**
 * Live PC station grid for an internet cafe branch. Subscribes to Supabase
 * Realtime so the grid updates in real time as PanCafe state changes (via
 * the pancafe-sync script pushing to pc_stations).
 */
export default function LivePCStations({
  branchId,
  branchSlug,
  initialStations,
  initialSyncedAt,
}: Props) {
  const [stations, setStations] = useState<PCStation[]>(initialStations);
  const [syncedAt, setSyncedAt] = useState<string | null>(initialSyncedAt);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<"grid" | "map">("grid");

  // Subscribe to Realtime for this branch's pc_stations
  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowser();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`pc_stations:${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pc_stations",
          filter: `branch_id=eq.${branchId}`,
        },
        (payload: { eventType: string; new: PCStation | null; old: PCStation | null }) => {
          setStations((prev) => {
            if (payload.eventType === "DELETE" && payload.old) {
              return prev.filter((s) => s.id !== payload.old!.id);
            }
            const row = payload.new;
            if (!row) return prev;
            const next = [...prev];
            const idx = next.findIndex((s) => s.id === row.id);
            if (idx >= 0) {
              next[idx] = row;
            } else {
              next.push(row);
            }
            // Re-sort by sort_order then name
            next.sort((a, b) => {
              if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
              return a.station_name.localeCompare(b.station_name);
            });
            if (row.last_synced_at) setSyncedAt(row.last_synced_at);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId]);

  // Re-render every 5 seconds so "X seconds ago" updates
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const summary = useMemo(() => {
    const vacant = stations.filter((s) => !s.is_occupied).length;
    const occupied = stations.length - vacant;
    return { total: stations.length, vacant, occupied };
  }, [stations]);

  const stale = useMemo(() => {
    if (!syncedAt) return true;
    const age = Date.now() - new Date(syncedAt).getTime();
    return age > 60_000; // 60 seconds
  }, [syncedAt, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const ageLabel = useMemo(() => {
    if (!syncedAt) return "never";
    const age = Math.max(0, Date.now() - new Date(syncedAt).getTime());
    const sec = Math.floor(age / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }, [syncedAt, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stations.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 md:py-32 border-y border-line bg-bg-soft overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="container-edge relative">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div>
            <p className="terminal-label">live_pcs.feed</p>
            <h2 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream">
              Live station status.
            </h2>
            <p className="mt-4 max-w-xl text-cream-dim text-lg">
              Real-time vacancy from the cafe floor. Reserve any vacant station
              and we&apos;ll have it ready when you arrive.
            </p>
          </div>

          {/* Stat tiles */}
          <div className="flex items-center gap-3">
            <StatTile label="Vacant" value={summary.vacant} accent="phosphor" />
            <StatTile label="In use" value={summary.occupied} accent="amber" />
            <StatTile label="Total" value={summary.total} accent="cream" />
          </div>
        </div>

        {/* Sync status bar */}
        <div className="mb-8 flex items-center justify-between gap-4 px-4 py-3 border border-line-bright bg-bg-card rounded-lg">
          <div className="flex items-center gap-3">
            {stale ? (
              <>
                <AlertTriangle className="h-4 w-4 text-amber" />
                <span className="font-mono text-xs text-amber">
                  // sync stale ({ageLabel}) — data may be out of date
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-phosphor animate-pulse shadow-[0_0_8px_var(--color-phosphor)]" />
                <span className="font-mono text-xs text-phosphor">
                  // live · synced {ageLabel}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setView("grid")}
              title="Grid view"
              className={`p-1.5 rounded border transition ${
                view === "grid"
                  ? "border-cream text-cream bg-bg-soft"
                  : "border-line-bright text-mocha hover:text-cream-dim"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("map")}
              title="Floor map"
              className={`p-1.5 rounded border transition ${
                view === "map"
                  ? "border-cream text-cream bg-bg-soft"
                  : "border-line-bright text-mocha hover:text-cream-dim"
              }`}
            >
              <Map className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Grid / Floor map */}
        {view === "map" ? (
          <PCFloorMap stations={stations} branchSlug={branchSlug} />
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <AnimatePresence mode="popLayout">
              {stations.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  branchSlug={branchSlug}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}

function CountdownTimer({ endsAt }: { endsAt: string }) {
  const calc = () => Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 60000));
  const [remaining, setRemaining] = useState(calc);

  useEffect(() => {
    const id = setInterval(() => setRemaining(calc), 10000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  if (remaining <= 0) return <span className="font-mono text-[0.7rem] text-red-400">ending soon</span>;
  const hrs = Math.floor(remaining / 60);
  const mins = remaining % 60;
  const label = hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
  return (
    <span className={`font-mono text-[0.7rem] ${remaining <= 10 ? "text-red-400" : "text-amber"}`}>
      {label}
    </span>
  );
}

function StationCard({
  station,
  branchSlug,
}: {
  station: PCStation;
  branchSlug: string;
}) {
  const occupied = station.is_occupied;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", duration: 0.35 }}
      className={`relative aspect-square rounded-xl border overflow-hidden ${
        occupied
          ? "border-line-bright bg-bg-card"
          : "border-phosphor/40 bg-phosphor/5 glow-phosphor"
      }`}
    >
      {/* Status indicator dot */}
      <div className="absolute top-3 right-3">
        <span
          className={`block h-2 w-2 rounded-full ${
            occupied
              ? "bg-amber shadow-[0_0_6px_var(--color-amber)]"
              : "bg-phosphor shadow-[0_0_8px_var(--color-phosphor)] animate-pulse"
          }`}
        />
      </div>

      <div className="h-full p-4 flex flex-col justify-between">
        <div>
          <Cpu
            className={`h-5 w-5 ${occupied ? "text-amber" : "text-phosphor"}`}
            strokeWidth={1.5}
          />
          <p className="mt-3 font-display text-xl font-bold text-cream tracking-tight">
            {station.station_name}
          </p>
        </div>

        {occupied ? (
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">
              // in use
            </p>
            {station.current_session_ends_at ? (
              <CountdownTimer endsAt={station.current_session_ends_at} />
            ) : station.is_member_session ? (
              <p className="font-mono text-[0.7rem] text-cream-dim mt-1">member session</p>
            ) : station.current_session_amount_php != null &&
              Number(station.current_session_amount_php) > 0 ? (
              <p className="font-mono text-[0.7rem] text-amber mt-1">
                ₱{Number(station.current_session_amount_php).toFixed(0)}
              </p>
            ) : null}
          </div>
        ) : (
          <Link
            href={`/branches/${branchSlug}/reserve-pc?pc=${encodeURIComponent(station.station_name)}`}
            className="block text-center font-mono text-[0.65rem] uppercase tracking-widest text-phosphor border border-phosphor/40 rounded px-2 py-1.5 hover:bg-phosphor/10 transition"
          >
            <Power className="inline h-3 w-3 mr-1" />
            Reserve
          </Link>
        )}
      </div>
    </motion.div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "phosphor" | "amber" | "cream";
}) {
  const colorMap = {
    phosphor: "text-phosphor",
    amber: "text-amber",
    cream: "text-cream",
  };
  return (
    <div className="px-4 py-3 border border-line-bright bg-bg-card rounded-lg text-center min-w-[80px]">
      <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-bold ${colorMap[accent]}`}>
        {value}
      </p>
    </div>
  );
}
