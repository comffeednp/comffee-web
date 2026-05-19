import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface PCStation {
  id: string;
  branch_id: string;
  station_name: string;
  is_occupied: boolean;
  raw_terminal_status: number | null;
  current_session_started_at: string | null;
  current_session_member_id: number | null;
  current_session_amount_php: number | null;
  last_synced_at: string;
  sort_order: number;
}

export interface PCStationsSnapshot {
  stations: PCStation[];
  lastSyncedAt: string | null;
  totalCount: number;
  vacantCount: number;
  occupiedCount: number;
}

/**
 * Load all PC stations for a branch. Used by the public branch detail page
 * to render the initial server-side state. The client component then
 * subscribes to Supabase Realtime for live updates.
 */
export async function getPCStationsForBranch(branchId: string): Promise<PCStationsSnapshot> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pc_stations")
      .select("*")
      .eq("branch_id", branchId)
      .order("sort_order", { ascending: true })
      .order("station_name", { ascending: true });
    if (error || !data) {
      return { stations: [], lastSyncedAt: null, totalCount: 0, vacantCount: 0, occupiedCount: 0 };
    }
    const stations = data as PCStation[];
    const vacantCount = stations.filter((s) => !s.is_occupied).length;
    const occupiedCount = stations.length - vacantCount;
    const lastSyncedAt =
      stations.length > 0
        ? stations.reduce(
            (latest, s) =>
              !latest || new Date(s.last_synced_at) > new Date(latest)
                ? s.last_synced_at
                : latest,
            null as string | null,
          )
        : null;
    return {
      stations,
      lastSyncedAt,
      totalCount: stations.length,
      vacantCount,
      occupiedCount,
    };
  } catch {
    return { stations: [], lastSyncedAt: null, totalCount: 0, vacantCount: 0, occupiedCount: 0 };
  }
}

/** Compute "stale" warning — if no sync in N minutes, the data is suspect. */
export function isSnapshotStale(snapshot: PCStationsSnapshot, maxAgeSeconds = 60): boolean {
  if (!snapshot.lastSyncedAt) return true;
  const age = Date.now() - new Date(snapshot.lastSyncedAt).getTime();
  return age > maxAgeSeconds * 1000;
}
