"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import AmenityIconPicker from "@/components/admin/AmenityIconPicker";

interface Props {
  branchId: string;
  nextOrder: number;
  addAction: (formData: FormData) => Promise<void>;
}

export default function AddAmenityForm({ branchId, nextOrder, addAction }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await addAction(formData);
      router.refresh();
      formRef.current?.reset();
    });
  };

  return (
    <form ref={formRef} action={handleSubmit} className="mt-5 grid gap-3 md:grid-cols-[auto_1fr_1fr_2fr_auto] items-end">
      <input type="hidden" name="branch_id" value={branchId} />
      <div>
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-1">// icon</p>
        <AmenityIconPicker />
      </div>
      <input name="label" placeholder="Label *" required className="admin-input" />
      <input name="sort_order" type="number" placeholder="order" defaultValue={nextOrder} className="admin-input" />
      <input name="description" placeholder="Description (optional)" className="admin-input" />
      <button type="submit" disabled={isPending} title="Add this amenity to the branch" className="key-cap !py-2 !px-3 disabled:opacity-40">
        <Plus className="h-4 w-4" />
        {isPending ? "Adding…" : "Add"}
      </button>

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
    </form>
  );
}
