import { Save } from "lucide-react";
import type { Branch } from "@/lib/supabase/types";
import { updateBranchBrandAction } from "@/app/admin/_actions/branch-brand";

// Owner-only brand grouping for a partner cafe. Branches of the same partner that share a brand name
// collapse into one card on the public /partners page (with a per-brand branch picker). Blank =
// standalone single-location partner. Rendered only for partner_cafe branches.
export default function BranchBrandForm({ branch }: { branch: Branch }) {
  return (
    <form
      action={updateBranchBrandAction}
      className="mt-8 rounded-lg border border-line-bright bg-bg p-5"
    >
      <input type="hidden" name="id" value={branch.id} />
      <p className="terminal-label">brand grouping</p>
      <p className="mt-2 max-w-2xl text-sm text-cream-dim">
        If this partner runs several branches, give{" "}
        <b>every one of their branches the same brand name</b> — they&apos;ll group under one card on
        the public Partner Cafes page, with a picker to choose a location. Leave blank for a
        standalone, single-location partner.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          name="brand"
          defaultValue={branch.brand ?? ""}
          placeholder="e.g. GameZone  (blank = standalone)"
          aria-label="Partner brand name"
          className="w-full max-w-sm rounded-lg border border-line-bright bg-bg px-3.5 py-2.5 text-sm text-cream placeholder:text-mocha focus:border-amber focus:outline-none"
        />
        <button type="submit" title="Save the brand grouping" className="key-cap !py-2 !px-3">
          <Save className="h-4 w-4" />
          Save brand
        </button>
      </div>
    </form>
  );
}
