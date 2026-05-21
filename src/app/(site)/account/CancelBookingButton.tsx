"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  id: string;
  kind: "booking" | "reservation";
  action: (formData: FormData) => Promise<void>;
}

export default function CancelBookingButton({ id, kind, action }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    const fd = new FormData();
    fd.append("id", id);
    startTransition(() => action(fd));
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[0.65rem] text-cream-dim">Cancel {kind}?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          title={`Yes, cancel this ${kind}`}
          className="font-mono text-[0.65rem] uppercase tracking-widest text-red-400 hover:text-red-300 px-2 py-1 border border-red-700/60 rounded transition disabled:opacity-40"
        >
          {isPending ? "…" : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          title="Keep this booking"
          className="font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim hover:text-cream px-2 py-1 transition"
        >
          Nevermind
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={`Cancel this ${kind}`}
      className="text-red-400 hover:text-red-300 p-2 transition"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
