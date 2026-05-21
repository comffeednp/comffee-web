"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  id: string;
  kind: "booking" | "reservation";
  action: (formData: FormData) => Promise<void>;
}

type Step = "idle" | "confirm" | "type";

export default function CancelBookingButton({ id, kind, action }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [typed, setTyped] = useState("");
  const [isPending, startTransition] = useTransition();

  const reset = () => { setStep("idle"); setTyped(""); };

  const handleFire = () => {
    const fd = new FormData();
    fd.append("id", id);
    startTransition(() => action(fd));
  };

  if (step === "type") {
    const confirmed = typed === "cancel-booking";
    return (
      <div className="flex flex-col gap-2 items-end shrink-0">
        <p className="font-mono text-[0.6rem] text-red-400 uppercase tracking-widest">
          type <span className="text-cream">cancel-booking</span> to confirm
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmed && handleFire()}
            placeholder="cancel-booking"
            autoFocus
            className="bg-bg border border-red-700/60 rounded px-2 py-1 font-mono text-[0.7rem] text-cream focus:outline-none focus:border-red-400 w-36"
          />
          <button
            type="button"
            onClick={handleFire}
            disabled={!confirmed || isPending}
            title="Confirm cancellation"
            className="font-mono text-[0.65rem] uppercase tracking-widest text-red-400 hover:text-red-300 px-2 py-1 border border-red-700/60 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isPending ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={reset}
            title="Go back, keep this booking"
            className="font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim hover:text-cream px-2 py-1 transition"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[0.65rem] text-cream-dim">Cancel {kind}?</span>
        <button
          type="button"
          onClick={() => setStep("type")}
          title={`Yes, proceed to cancel this ${kind}`}
          className="font-mono text-[0.65rem] uppercase tracking-widest text-red-400 hover:text-red-300 px-2 py-1 border border-red-700/60 rounded transition"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={reset}
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
      onClick={() => setStep("confirm")}
      title={`Cancel this ${kind}`}
      className="text-red-400 hover:text-red-300 p-2 transition"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
