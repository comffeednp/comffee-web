import { setPCTierAction } from "@/app/admin/_actions/pc-tiers";

interface Station {
  id: string;
  station_name: string;
  is_occupied: boolean;
  pc_tier: string | null;
  last_synced_at: string;
}

interface Props {
  branchId: string;
  stations: Station[];
}

/**
 * Inline editor for setting each PC station's tier (regular / vip / none).
 * Shown on the branch edit page only for cafe branches that have synced
 * stations. The tier determines which rate cards customers see when
 * reserving that PC.
 */
export default function PCTierEditor({ branchId, stations }: Props) {
  if (stations.length === 0) {
    return (
      <div className="p-5 border border-dashed border-line-bright rounded-lg text-center">
        <p className="font-mono text-xs text-mocha uppercase tracking-widest">
          // no pc stations synced yet
        </p>
        <p className="mt-2 text-sm text-cream-dim">
          Run the <code className="text-amber">pancafe-sync</code> script on the cafe server. Once it pushes data, stations will appear here for tier assignment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stations.map((s) => (
        <form
          key={s.id}
          action={setPCTierAction}
          className="flex items-center gap-3 p-3 border border-line rounded-md bg-bg"
        >
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="branch_id" value={branchId} />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-cream">
              {s.station_name}
            </p>
            <p className="font-mono text-[0.65rem] text-mocha mt-0.5">
              {s.is_occupied ? "in use" : "vacant"} · last synced{" "}
              {new Date(s.last_synced_at).toLocaleTimeString("en-PH")}
            </p>
          </div>
          <select
            name="pc_tier"
            defaultValue={s.pc_tier ?? ""}
            className="admin-input !py-1.5 !px-3 max-w-[8rem]"
          >
            <option value="">— any —</option>
            <option value="regular">Regular</option>
            <option value="vip">VIP</option>
          </select>
          <button
            type="submit"
            className="font-mono text-[0.65rem] uppercase tracking-widest text-amber hover:underline px-2"
          >
            Save
          </button>
        </form>
      ))}
    </div>
  );
}
