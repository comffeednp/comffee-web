"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from "lucide-react";

// Stage 7a client widget: shows the partner's GCash QR + a 5-minute countdown + an "I paid"
// button. On "I paid" → POST /api/pc-reservations/<id>/claim-paid → status flips to
// payment_status='claim_paid' (the partner's POS picks it up and verifies via existing OCR).
// Re-polls the reservation status every 4s so when the partner confirms, the UI updates
// without a manual refresh.

interface Props {
  reservationId: string;
  branchSlug: string;
  totalPhp: number;
  gcashQrUrl: string | null;
  gcashType: string | null;
  paymentHoldExpiresAt: string | null;
  initialPaymentStatus: string;
  initialStatus: string;
}

export default function PaymentClient({
  reservationId,
  branchSlug,
  totalPhp,
  gcashQrUrl,
  paymentHoldExpiresAt,
  initialPaymentStatus,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [status, setStatus] = useState(initialStatus);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the countdown every second.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Poll the reservation every 4s while waiting on the partner's verification — so the customer
  // sees "verified" automatically when the cashier confirms.
  useEffect(() => {
    if (status !== "pending" || paymentStatus === "verified") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/pc-reservations/${reservationId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { payment_status?: string; status?: string };
        if (data.payment_status && data.payment_status !== paymentStatus) setPaymentStatus(data.payment_status);
        if (data.status && data.status !== status) setStatus(data.status);
      } catch {
        // network blip — keep polling
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [reservationId, status, paymentStatus]);

  const holdMs = paymentHoldExpiresAt ? new Date(paymentHoldExpiresAt).getTime() : null;
  const remainingMs = holdMs ? Math.max(0, holdMs - now) : 0;
  const expired = status === "expired" || status === "cancelled";
  const verified = paymentStatus === "verified";
  const claimed = paymentStatus === "claim_paid";
  const showCountdown = !expired && !verified && !claimed;
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  async function claimPaid() {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch(`/api/pc-reservations/${reservationId}/claim-paid`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ? `Failed: ${data.error}` : `Failed (${res.status})`);
        return;
      }
      setPaymentStatus("claim_paid");
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setClaiming(false);
    }
  }

  if (expired) {
    return (
      <div className="rounded-xl border-2 border-red-700/40 bg-red-950/20 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
        <h2 className="mt-4 font-display text-2xl text-cream">Reservation expired</h2>
        <p className="mt-2 text-cream-dim">The 5-minute payment hold ended. Start a new reservation if you still want a PC.</p>
        <button
          type="button"
          onClick={() => router.push(`/branches/${branchSlug}/reserve-pc`)}
          title="Start a new reservation"
          className="mt-6 key-cap key-cap-primary"
        >
          Pick another PC
        </button>
      </div>
    );
  }

  if (verified) {
    return (
      <div className="rounded-xl border-2 border-green-700/40 bg-green-950/20 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto" />
        <h2 className="mt-4 font-display text-2xl text-cream">Payment verified</h2>
        <p className="mt-2 text-cream-dim">Walk in within 30 minutes. The cafe is expecting you.</p>
        <button
          type="button"
          onClick={() => router.push(`/branches/${branchSlug}`)}
          title="Back to branch page"
          className="mt-6 key-cap"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Countdown + amount card */}
      <div className="rounded-xl border-2 border-amber/40 bg-bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="terminal-label">amount_due</p>
            <p className="mt-2 font-display text-5xl md:text-6xl font-bold text-amber">
              ₱{totalPhp.toFixed(2)}
            </p>
          </div>
          {showCountdown && (
            <div className="text-right">
              <p className="font-mono text-xs uppercase tracking-widest text-cream-dim">
                <Clock className="h-3 w-3 inline mr-1" />
                Time to pay
              </p>
              <p className={`mt-2 font-mono text-3xl md:text-4xl font-bold ${remainingMs < 60000 ? "text-red-400" : "text-cream"}`}>
                {mm}:{ss}
              </p>
            </div>
          )}
        </div>

        {/* QR */}
        <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr] items-start">
          <div className="bg-white rounded-lg p-4 border border-line">
            {gcashQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gcashQrUrl}
                alt="GCash payment QR"
                className="w-full h-auto object-contain"
                style={{ aspectRatio: "1 / 1" }}
              />
            ) : (
              <div className="aspect-square flex items-center justify-center text-mocha text-sm text-center p-6">
                The cafe hasn&apos;t uploaded a payment QR yet. Walk in to pay at the counter.
              </div>
            )}
          </div>
          <div>
            <h3 className="font-display text-lg text-cream font-bold">How to pay</h3>
            <ol className="mt-3 space-y-2 text-sm text-cream-dim leading-relaxed list-decimal pl-5">
              <li>Open <strong>GCash</strong> on your phone.</li>
              <li>Tap <strong>Pay QR</strong> → <strong>Scan</strong> and point at the QR.</li>
              <li>Enter the exact amount above (<strong className="text-amber">₱{totalPhp.toFixed(2)}</strong>) and send.</li>
              <li>Come back here and tap <strong>I paid</strong> below.</li>
            </ol>
            <p className="mt-4 text-xs text-mocha">
              The cafe&apos;s POS will spot your receipt and lock in your station within a few seconds. If you don&apos;t pay before the countdown hits zero, the reservation cancels and your PC goes back to the vacant list.
            </p>
          </div>
        </div>

        {/* "I paid" — claim_paid state shows a waiting indicator instead */}
        <div className="mt-6 pt-6 border-t border-line flex flex-wrap items-center gap-4">
          {claimed ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-amber" />
              <span className="text-sm text-cream-dim">Waiting for the cafe to spot your GCash receipt…</span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={claimPaid}
                disabled={claiming || remainingMs <= 0}
                title="Mark this reservation as paid"
                className="key-cap key-cap-primary"
              >
                {claiming ? "Sending…" : "I paid"}
              </button>
              <span className="text-xs text-cream-dim font-mono">
                Only tap after you&apos;ve actually sent the payment in GCash.
              </span>
            </>
          )}
          {error && <p className="basis-full text-sm text-red-400 mt-2">✗ {error}</p>}
        </div>
      </div>
    </div>
  );
}
