import Link from "next/link";
import { Monitor, Gamepad2 } from "lucide-react";
import type { PCStation } from "@/lib/pc-stations";

interface Props {
  stations: PCStation[];
  branchSlug: string;
  // When false (owner's "accept online reservations" switch is off), vacant tiles are NOT clickable
  // reserve links — they just show "vacant" like the grid view does (2026-05-30).
  canReserve: boolean;
}

const SECTION_ORDER = ["regular", "vip", "console"] as const;

function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

function buildSections(stations: PCStation[]): { label: string; tier: string; stations: PCStation[] }[] {
  const hasTier = stations.some((s) => s.pc_tier != null);
  if (!hasTier) return [{ label: "", tier: "", stations }];

  const grouped: Record<string, PCStation[]> = {};
  for (const s of stations) {
    const key = s.pc_tier ?? "regular";
    (grouped[key] ??= []).push(s);
  }
  return SECTION_ORDER.filter((k) => grouped[k]?.length > 0).map((k) => ({
    tier: k,
    label: k[0].toUpperCase() + k.slice(1),
    stations: grouped[k],
  }));
}

const COLS_BY_TIER: Record<string, number> = { regular: 5, vip: 5, console: 2, "": 5 };

export default function PCFloorMap({ stations, branchSlug, canReserve }: Props) {
  const sections = buildSections(stations);

  return (
    <div className="space-y-10">
      {sections.map((section) => {
        const cols = COLS_BY_TIER[section.tier] ?? 5;
        const rows = chunk(section.stations, cols);
        return (
          <div key={section.tier || "main"}>
            {section.label && (
              <div className="flex items-center gap-3 mb-5">
                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                  {section.label} · {section.stations.length} stations
                </span>
                <div className="flex-1 h-px bg-line-bright" />
              </div>
            )}
            <div className="space-y-4">
              {rows.map((row, rowIdx) => (
                <div key={rowIdx}>
                  {/* Wall / back-of-desk bar */}
                  <div className="h-2 rounded-sm mb-2 bg-line-bright/50 border border-line-bright" />
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {row.map((s) => (
                      <MapTile key={s.id} station={s} branchSlug={branchSlug} canReserve={canReserve} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 opacity-30">
              <div className="flex-1 border-t border-dashed border-line-bright" />
              <span className="font-mono text-[0.55rem] uppercase tracking-widest text-mocha">entrance</span>
              <div className="flex-1 border-t border-dashed border-line-bright" />
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-5 pt-3 border-t border-line">
        <LegendDot color="phosphor" label="Vacant" />
        <LegendDot color="amber" label="In use" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: "phosphor" | "amber"; label: string }) {
  const cls =
    color === "phosphor"
      ? "border-phosphor/60 bg-phosphor/15"
      : "border-amber/60 bg-amber/15";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm border ${cls}`} />
      <span className="font-mono text-[0.6rem] uppercase tracking-wide text-mocha">{label}</span>
    </div>
  );
}

function MapTile({ station, branchSlug, canReserve }: { station: PCStation; branchSlug: string; canReserve: boolean }) {
  const occupied = station.is_occupied;
  const isConsole = station.pc_tier === "console";
  const Icon = isConsole ? Gamepad2 : Monitor;

  const inner = (
    <div
      className={`relative rounded-lg border p-3 transition-colors ${
        occupied
          ? "border-amber/40 bg-amber/5"
          : "border-phosphor/40 bg-phosphor/10 hover:bg-phosphor/20"
      }`}
    >
      <span
        className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full ${
          occupied
            ? "bg-amber shadow-[0_0_4px_var(--color-amber)]"
            : "bg-phosphor shadow-[0_0_5px_var(--color-phosphor)] animate-pulse"
        }`}
      />
      <Icon
        className={`h-4 w-4 mb-1.5 ${occupied ? "text-amber/50" : "text-phosphor/70"}`}
        strokeWidth={1.5}
      />
      <p
        className={`font-mono text-[0.62rem] font-bold leading-tight ${
          occupied ? "text-cream-dim" : "text-cream"
        }`}
      >
        {station.station_name}
      </p>
      <p
        className={`font-mono text-[0.52rem] uppercase tracking-wide mt-0.5 ${
          occupied ? "text-mocha" : "text-phosphor"
        }`}
      >
        {occupied ? "in use" : "vacant"}
      </p>
    </div>
  );

  // Occupied tiles, and ALL tiles when reservations are switched off, are non-clickable — the tile
  // already prints "vacant"/"in use". Only a vacant tile WITH reservations on becomes a reserve link.
  if (occupied || !canReserve) return inner;

  return (
    <Link
      href={`/branches/${branchSlug}/reserve-pc?pc=${encodeURIComponent(station.station_name)}`}
      title="Reserve this PC"
      className="block"
    >
      {inner}
    </Link>
  );
}
