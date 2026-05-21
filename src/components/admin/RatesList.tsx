"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import type { BranchRate } from "@/lib/supabase/types";

interface Props {
  rates: BranchRate[];
  branchId: string;
  isPlaycation: boolean;
  updateAction: (formData: FormData) => Promise<{ error: string } | undefined>;
  deleteAction: (formData: FormData) => Promise<void>;
}

export default function RatesList({ rates, branchId, isPlaycation, updateAction, deleteAction }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (formData: FormData) => {
    setSaveError(null);
    startTransition(async () => {
      const result = await updateAction(formData);
      if (result?.error) {
        setSaveError(result.error);
        return;
      }
      router.refresh();
      setOpenId(null);
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("branch_id", branchId);
      await deleteAction(fd);
      router.refresh();
    });
  };

  return (
    <ul className="space-y-2">
      {rates.map((r) => (
        <li key={r.id} className="border border-line rounded-md bg-bg overflow-hidden">
          <div className="flex items-center justify-between gap-4 p-3">
            <div>
              <div className="text-cream font-medium">{r.label}</div>
              <div className="font-mono text-xs text-mocha">
                {r.category} · {formatPHP(r.price_php)}/{r.unit}
                {r.max_pax != null && (
                  <> · up to {r.max_pax} pax{r.extra_pax_fee_php != null && `, +${formatPHP(r.extra_pax_fee_php)}/extra pax`}</>
                )}
                {r.max_guests != null && <> · max {r.max_guests} guests</>}
                {(r.check_in_time || r.check_out_time) && (
                  <> · {r.check_in_time ?? "—"} → {r.check_out_time ?? "—"}</>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                title={openId === r.id ? "Close edit form" : "Edit this rate"}
                className="font-mono text-[0.65rem] uppercase tracking-widest text-amber hover:underline px-2 py-1"
              >
                {openId === r.id ? "Close" : "Edit"}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={isPending}
                className="text-red-400 hover:text-red-300 p-2 disabled:opacity-40"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {openId === r.id && (
            <form action={handleUpdate} className="border-t border-line p-4 space-y-3 bg-bg-soft">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="branch_id" value={branchId} />
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_2fr]">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// category</p>
                  <input name="category" defaultValue={r.category} className="admin-input" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// label *</p>
                  <input name="label" defaultValue={r.label} required className="admin-input" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// price (₱)</p>
                  <input name="price_php" type="number" step="0.01" defaultValue={r.price_php} required className="admin-input" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// unit</p>
                  <input name="unit" defaultValue={r.unit} className="admin-input" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// description</p>
                  <input name="description" defaultValue={r.description ?? ""} className="admin-input" />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// check-in time (24h, e.g. 14:00)</p>
                  <input name="check_in_time" type="text" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="14:00" defaultValue={r.check_in_time ?? ""} className="admin-input" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// check-out time (24h, e.g. 12:00)</p>
                  <input name="check_out_time" type="text" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="12:00" defaultValue={r.check_out_time ?? ""} className="admin-input" />
                </div>
              </div>
              {isPlaycation && (
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// max pax included</p>
                    <input name="max_pax" type="number" min="1" defaultValue={r.max_pax ?? ""} placeholder="blank = no limit" className="admin-input" />
                  </div>
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// max guests allowed</p>
                    <input name="max_guests" type="number" min="1" defaultValue={r.max_guests ?? ""} placeholder="blank = no limit" className="admin-input" />
                  </div>
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// extra fee/pax (₱)</p>
                    <input name="extra_pax_fee_php" type="number" step="0.01" defaultValue={r.extra_pax_fee_php ?? ""} placeholder="e.g. 500" className="admin-input" />
                  </div>
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// sort order</p>
                    <input name="sort_order" type="number" defaultValue={r.sort_order} className="admin-input" />
                  </div>
                </div>
              )}
              {saveError && openId === r.id && (
                <p className="font-mono text-xs text-red-400">// error: {saveError}</p>
              )}
              <button type="submit" disabled={isPending} title="Save rate changes" className="key-cap key-cap-primary !py-1.5 !px-4 text-xs disabled:opacity-50">
                {isPending ? "Saving…" : "Save"}
              </button>
            </form>
          )}
        </li>
      ))}
      {rates.length === 0 && <li className="font-mono text-xs text-mocha">// no rates yet</li>}

      <style>{`
        .admin-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-mono);
          font-size: 0.9rem;
          color-scheme: dark;
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
        }
      `}</style>
    </ul>
  );
}
