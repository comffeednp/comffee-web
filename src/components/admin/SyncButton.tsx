"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

export function SyncButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Sync Airbnb calendar now"
      className={`flex items-center gap-1.5 border border-phosphor/40 rounded-md px-3 py-1.5 text-[0.7rem] font-mono uppercase tracking-widest text-phosphor hover:bg-phosphor/10 ${pending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Syncing…" : "Sync now"}
    </button>
  );
}
