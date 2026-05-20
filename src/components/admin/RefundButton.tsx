"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { formatPHP } from "@/lib/utils";

interface Props {
  orderId?: string;
  reservationId?: string;
  totalPhp: number;
  alreadyRefunded?: number;
  guestPhone?: string | null;
}

export default function RefundButton({
  orderId,
  reservationId,
  totalPhp,
  alreadyRefunded = 0,
  guestPhone,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, totalPhp - alreadyRefunded);
  const [amount, setAmount] = useState(remaining);
  const [reason, setReason] = useState("Customer request");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    if (amount <= 0 || amount > remaining) {
      setError(`amount must be 0–${remaining}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/refunds/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          reservationId,
          amountPhp: amount,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.detail === "QRPH_MANUAL_REQUIRED") {
          setError(`qrph_manual`);
        } else {
          setError(data.detail ?? data.error ?? "refund failed");
        }
        setLoading(false);
        return;
      }
      setOpen(false);
      setLoading(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
      setLoading(false);
    }
  };

  if (remaining <= 0) {
    return (
      <span className="font-mono text-[0.7rem] uppercase tracking-widest text-mocha">
        // fully refunded
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-amber/50 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-amber hover:bg-amber/10"
      >
        <Undo2 className="h-3.5 w-3.5" />
        Issue refund
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur">
          <div className="w-full max-w-md border border-line-bright bg-bg-card rounded-2xl p-6">
            <p className="terminal-label">// issue_refund</p>
            <h3 className="mt-2 font-display text-2xl font-bold text-cream">
              Refund
            </h3>
            <p className="mt-2 text-sm text-cream-dim">
              Available to refund: {formatPHP(remaining)}
              {alreadyRefunded > 0 && (
                <> · already refunded: {formatPHP(alreadyRefunded)}</>
              )}
            </p>

            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                  // amount (₱)
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={remaining}
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-cream font-mono"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                  // reason
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-cream"
                />
              </label>
            </div>

            {error && error === "qrph_manual" ? (
              <div className="mt-4 p-3 border border-amber/40 rounded-md bg-amber/5">
                <p className="font-mono text-xs text-amber">// QR Ph payment — API refund not supported</p>
                <p className="mt-1 text-sm text-cream-dim">
                  Send <strong className="text-cream">{formatPHP(amount)}</strong> manually via GCash
                  {guestPhone ? <> to <strong className="text-amber font-mono">{guestPhone}</strong></> : " to the guest's number"}.
                </p>
              </div>
            ) : error ? (
              <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handle}
                disabled={loading}
                className="key-cap key-cap-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Processing
                  </>
                ) : (
                  <>
                    <Undo2 className="h-3.5 w-3.5" />
                    Refund {formatPHP(amount)}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
