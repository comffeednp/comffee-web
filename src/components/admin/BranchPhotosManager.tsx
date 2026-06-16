"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Star } from "lucide-react";
import type { BranchPhoto } from "@/lib/supabase/types";

interface Props {
  photos: BranchPhoto[];
  branchId: string;
  // Saves the new order (index = sort_order). Index 0 becomes the public front/header photo.
  reorderAction: (branchId: string, orderedIds: string[]) => Promise<{ error?: string } | void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

/**
 * Drag-to-reorder gallery for a branch's photos (admin). The FIRST photo (index 0) is the public
 * front/header photo — the public branch page uses photos[0] for its hero, OG image, and schema
 * image, falling back to the branch's manual "backup front photo" only when there are no photos.
 * (Owner 2026-05-30: "drag the photos, the first one should be the header.")
 *
 * Reordering is OPTIMISTIC: we move locally, then persist. If the save fails we revert AND show the
 * error inline (never a silent half-applied order). Drag covers desktop; the per-card "Make front"
 * button is the reliable one-click path (and works on touch where HTML5 drag is flaky).
 */
export default function BranchPhotosManager({ photos, branchId, reorderAction, deleteAction }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<BranchPhoto[]>(photos);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);

  function persist(next: BranchPhoto[], prev: BranchPhoto[]) {
    setItems(next);
    setErr(null);
    startTransition(async () => {
      const res = await reorderAction(branchId, next.map((p) => p.id));
      if (res && "error" in res && res.error) {
        setItems(prev); // revert — the DB didn't change, so the UI must not lie
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const prev = items;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next, prev);
  }

  function handleDelete(id: string) {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("branch_id", branchId);
      await deleteAction(fd);
      setItems((cur) => cur.filter((p) => p.id !== id));
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="font-mono text-xs text-mocha">// no photos yet — add some below</p>;
  }

  return (
    <div>
      <p className="font-mono text-[0.65rem] text-mocha mb-3">
        // drag a photo to reorder — the FIRST photo is your public front / header photo
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p, i) => (
          <div
            key={p.id}
            draggable
            onDragStart={() => {
              dragFrom.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null) move(dragFrom.current, i);
              dragFrom.current = null;
            }}
            className={`relative group border rounded-md overflow-hidden bg-bg cursor-move ${
              i === 0 ? "border-amber ring-1 ring-amber/50" : "border-line"
            } ${isPending ? "opacity-70" : ""}`}
          >
            {i === 0 && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-amber text-black font-mono text-[0.6rem] font-bold uppercase tracking-widest px-2 py-1 rounded">
                <Star className="h-3 w-3" /> Front photo
              </div>
            )}
            {p.public_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.public_url}
                alt={p.caption ?? ""}
                className="w-full aspect-[4/3] object-cover pointer-events-none select-none"
                draggable={false}
              />
            )}
            <div className="p-2 flex items-center justify-between gap-2">
              {i !== 0 ? (
                <button
                  type="button"
                  onClick={() => move(i, 0)}
                  disabled={isPending}
                  title="Make this the front / header photo"
                  className="font-mono text-[0.6rem] uppercase tracking-widest text-amber hover:underline disabled:opacity-40"
                >
                  ← Make front
                </button>
              ) : (
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">
                  shown first
                </span>
              )}
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                disabled={isPending}
                title="Delete this photo"
                aria-label="Delete photo"
                className="text-red-400 hover:text-red-300 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {isPending && <p className="font-mono text-[0.65rem] text-amber mt-2">// saving…</p>}
      {err && <p className="font-mono text-[0.65rem] text-red-400 mt-2">// could not save order: {err}</p>}
    </div>
  );
}
