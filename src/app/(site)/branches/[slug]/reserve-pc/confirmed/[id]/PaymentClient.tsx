"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Clock, AlertTriangle, Loader2, Users } from "lucide-react";

// DIY-QR reservation payment widget. Polls /api/pc-reservations/<id>/pay-status every 3s, which drives
// the pay QUEUE and returns the current state:
//   'queued'   -> someone else is paying the SAME amount; we wait our turn (auto-advances).
//   'awaiting' -> our turn: render the Bookings QR (from the EMVCo string) + a countdown.
//   'paid'     -> the POS matched our PayMongo payment -> show the reservation CODE (unlock + counter).
//   'expired'  -> the pay window passed with no payment -> offer to rebook.
// No "I paid" button — PayMongo confirms on its own (the POS watches it).

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
  windowExpiresAt?: string | null;
  qrString?: string | null;
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
  const [qrString, setQrString] = useState<string | null>(null);
  const [windowExpiresAt, setWindowExpiresAt] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1s countdown ticker.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pc-reservations/${reservationId}/pay-status`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as Resp;
      if (d.paymentStatus) setPayStatus(d.paymentStatus);
      setQrString(d.qrString ?? null);
      setWindowExpiresAt(d.windowExpiresAt ?? null);
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

  const remainingMs = windowExpiresAt ? Math.max(0, new Date(windowExpiresAt).getTime() - now) : 0;
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000).toString().padStart(2, "0");

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
        <p className="mt-5 text-xs text-mocha">Arrive within 10 minutes. The cafe has been alerted.</p>
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
        <h2 className="mt-4 font-display text-2xl text-cream">Payment window closed</h2>
        <p className="mt-2 text-cream-dim">The time to pay ran out, so station {stationName} went back to the vacant list. Start again if you still want a PC.</p>
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

  // ---- QUEUED (waiting for the same-amount pay slot) ----
  if (payStatus === "queued") {
    return (
      <div className="rounded-xl border-2 border-amber/40 bg-bg-card p-8 text-center">
        <Users className="h-10 w-10 text-amber mx-auto" />
        <h2 className="mt-4 font-display text-2xl text-cream">You&apos;re next in line</h2>
        <p className="mt-2 text-cream-dim max-w-md mx-auto">
          Someone is paying the exact same amount (₱{totalPhp.toFixed(2)}) right now. To keep payments from
          getting mixed up, we&apos;ll show your QR the moment they finish — hold on, this is automatic.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-amber">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-mono text-sm">waiting for your turn…</span>
        </div>
      </div>
    );
  }

  // ---- AWAITING (our turn: show the QR) ----
  return (
    <div className="rounded-xl border-2 border-amber/40 bg-bg-card p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="terminal-label">amount_to_pay</p>
          <p className="mt-2 font-display text-5xl md:text-6xl font-bold text-amber">₱{totalPhp.toFixed(2)}</p>
        </div>
        {windowExpiresAt && (
          <div className="text-right">
            <p className="font-mono text-xs uppercase tracking-widest text-cream-dim">
              <Clock className="h-3 w-3 inline mr-1" /> Time to pay
            </p>
            <p className={`mt-2 font-mono text-3xl md:text-4xl font-bold ${remainingMs < 60000 ? "text-red-400" : "text-cream"}`}>
              {mm}:{ss}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr] items-start">
        <div className="bg-white rounded-lg p-4 border border-line flex items-center justify-center aspect-square">
          {qrString ? (
            <QRCodeSVG value={qrString} size={224} level="H" includeMargin className="h-auto w-full max-w-[224px]" />
          ) : (
            <div className="flex items-center justify-center text-mocha text-sm text-center p-6">
              Preparing your QR…
            </div>
          )}
        </div>
        <div>
          <h3 className="font-display text-lg text-cream font-bold">How to pay</h3>
          <ol className="mt-3 space-y-2 text-sm text-cream-dim leading-relaxed list-decimal pl-5">
            <li>Open <strong>GCash</strong> (or any app that scans QR Ph).</li>
            <li>Tap <strong>Pay QR</strong> → <strong>Scan</strong> and point at the QR.</li>
            <li>The amount is already filled in (<strong className="text-amber">₱{totalPhp.toFixed(2)}</strong>) — just send.</li>
          </ol>
          <p className="mt-4 text-xs text-mocha">
            This page confirms on its own within a few seconds of your payment — no need to tap anything.
            If the timer hits zero before you pay, the station goes back to the vacant list.
          </p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-line flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-amber" />
        <span className="text-sm text-cream-dim">Waiting for your payment to land…</span>
      </div>
    </div>
  );
}
