"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { BranchAmenity } from "@/lib/supabase/types";
import AmenityIconPicker from "@/components/admin/AmenityIconPicker";

interface Props {
  amenities: BranchAmenity[];
  branchId: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

export default function AmenitiesList({ amenities, branchId, updateAction, deleteAction }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (formData: FormData) => {
    startTransition(async () => {
      await updateAction(formData);
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
      {amenities.map((a) => (
        <li key={a.id} className="border border-line rounded-md bg-bg">
          <div className="flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <div className="text-cream font-medium">{a.label}</div>
              {a.description && (
                <div className="text-xs text-cream-dim truncate">{a.description}</div>
              )}
              <div className="font-mono text-[0.65rem] text-mocha mt-0.5">
                icon: {a.icon} · order: {a.sort_order}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setOpenId(openId === a.id ? null : a.id)}
                className="font-mono text-[0.65rem] uppercase tracking-widest text-amber hover:underline px-2 py-1"
              >
                {openId === a.id ? "Close" : "Edit"}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={isPending}
                className="text-red-400 hover:text-red-300 p-2 disabled:opacity-40"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {openId === a.id && (
            <form action={handleUpdate} className="border-t border-line p-4 bg-bg-soft space-y-3">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="branch_id" value={branchId} />
              <div className="grid gap-3 md:grid-cols-[auto_2fr_2fr_1fr]">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// icon</p>
                  <AmenityIconPicker defaultValue={a.icon} />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// label *</p>
                  <input name="label" defaultValue={a.label} required className="admin-input" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// description</p>
                  <input name="description" defaultValue={a.description ?? ""} className="admin-input" />
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// order</p>
                  <input name="sort_order" type="number" defaultValue={a.sort_order} className="admin-input" />
                </div>
              </div>
              <button type="submit" disabled={isPending} className="key-cap key-cap-primary !py-1.5 !px-4 text-xs disabled:opacity-40">
                {isPending ? "Saving…" : "Save"}
              </button>
            </form>
          )}
        </li>
      ))}
      {amenities.length === 0 && (
        <li className="font-mono text-xs text-mocha">// no amenities yet</li>
      )}

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
