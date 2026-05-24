"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPHP } from "@/lib/utils";

/** Lets a member pay the remaining 70% balance on a partial booking. */
export default function PayBalanceButton({
  reservationId,
  balancePhp,
}: {
  reservationId: string;
  balancePhp: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/pay-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "could not start payment");
        setLoading(false);
        return;
      }
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener");
        setLoading(false);
        return;
      }
      if (data.simulated) {
        router.refresh();
        return;
      }
      setError("unexpected response");
      setLoading(false);
    } catch {
      setError("network error");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={pay}
        disabled={loading}
        title="Pay the remaining balance for this booking"
        className="key-cap key-cap-primary !py-2 !px-4 disabled:opacity-50"
      >
        {loading ? "Starting…" : `Pay balance · ${formatPHP(balancePhp)}`}
      </button>
      {error && <span className="font-mono text-[0.65rem] text-red-400">// {error}</span>}
    </div>
  );
}
