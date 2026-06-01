"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

// PayMongo hosted-checkout reservation status (2026-06-01). The customer pays on PayMongo's hosted
// page; PayMongo's success_url returns them HERE, and PayMongo's webhook flips the booking to 'paid'.
// This widget polls /api/pc-reservations/<id>/pay-status every 3s and shows:
//   'unpaid'  -> waiting for the payment to land (just back from checkout, webhook not in yet) +
//                a "Pay again" link in case they bailed out of the hosted page without paying.
//   'paid'    -> the reservation CODE (unlock + counter lookup).
//   'expired' -> the booking was released; offer to rebook.
// No QR, no "I paid" button — PayMongo confirms on its own.

interface Props {
  reservationId: string;
  branchSlug: string;
  totalPhp: number;
  stationName: string;
  initialPaymentStatus: string;
}

type Resp = {
  ok?: boolean;
  paymentStatus?: string;
  totalPhp?: number;
  stationName?: string;
  reservationCode?: string | null;
};

export default function PaymentClient({
  reservationId,
  branchSlug,
  totalPhp,
  stationName,
  initialPaymentStatus,
}: Props) {
  const router = useRouter();
  const [payStatus, setPayStatus] = useState(initialPaymentStatus);
  const [code, setCode] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pc-reservations/${reservationId}/pay-status`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as Resp;
      if (d.paymentStatus) setPayStatus(d.paymentStatus);
      if (d.reservationCode) setCode(d.reservationCode);
    } catch {
      /* network blip — next tick retries */
    }
  }, [reservationId]);

  // Poll immediately, then every 3s, until the booking is paid or expired.
  useEffect(() => {
    if (payStatus === "paid" || payStatus === "expired") return;
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [poll, payStatus]);

  // ---- PAID ----
  if (payStatus === "paid") {
    return (
      <div className="rounded-xl border-2 border-green-700/40 bg-green-950/20 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
        <h2 className="mt-4 font-display text-2xl text-cream">Reserved! Station {stationName} is yours.</h2>
        <p className="mt-2 text-cream-dim">Your reservation code — show it at the counter and use it to unlock your PC:</p>
        <div className="mt-5 inline-block rounded-lg border-2 border-green-600/50 bg-bg-card px-8 py-4">
          <span className="font-mono text-4xl md:text-5xl font-extrabold tracking-[0.3em] text-amber">
            {code ?? "—"}
          </span>
        </div>
        <p className="mt-5 text-xs text-mocha">Head over and start your time — the cafe has been alerted.</p>
        <button
          type="button"
          onClick={() => router.push(`/branches/${branchSlug}`)}
          title="Back to the branch page"
          className="mt-6 key-cap"
        >
          Done
        </button>
      </div>
    );
  }

  // ---- EXPIRED ----
  if (payStatus === "expired") {
    return (
      <div className="rounded-xl border-2 border-red-700/40 bg-red-950/20 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
        <h2 className="mt-4 font-display text-2xl text-cream">Reservation released</h2>
        <p className="mt-2 text-cream-dim">This booking timed out, so station {stationName} went back to the vacant list. Start again if you still want a PC.</p>
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

  // ---- UNPAID (waiting for the PayMongo webhook to confirm; or they bailed and can pay again) ----
  return (
    <div className="rounded-xl border-2 border-amber/40 bg-bg-card p-8 text-center">
      <Loader2 className="h-10 w-10 text-amber mx-auto animate-spin" />
      <h2 className="mt-4 font-display text-2xl text-cream">Waiting for your payment…</h2>
      <p className="mt-2 text-cream-dim max-w-md mx-auto">
        We&apos;re confirming your ₱{totalPhp.toFixed(2)} payment for station {stationName}. This page
        updates on its own within a few seconds of paying — no need to tap anything.
      </p>
      <p className="mt-4 text-sm text-mocha max-w-md mx-auto">
        Didn&apos;t finish paying, or closed the payment page by mistake?
      </p>
      <button
        type="button"
        onClick={() => router.push(`/branches/${branchSlug}/reserve-pc`)}
        title="Start the reservation again"
        className="mt-3 key-cap"
      >
        Reserve again
      </button>
    </div>
  );
}
