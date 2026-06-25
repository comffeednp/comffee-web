"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * On the confirmed/receipt page, a reservation that is still `pending_hold` is
 * waiting for the guest's payment to land (PayMongo webhook, or the 5-min
 * reconcile cron). This poller watches the reservation status and refreshes the
 * server component the moment it flips — so a guest who pays (or whose payment is
 * reconciled) sees "BOOKING CONFIRMED" without manually reloading, and a hold that
 * expires flips to the released state on its own. No-op once not pending_hold.
 */
export default function ReservationStatusPoller({
  reservationId,
  initialStatus,
}: {
  reservationId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const last = useRef(initialStatus);

  useEffect(() => {
    if (initialStatus !== "pending_hold") return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status?id=${reservationId}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { status?: string };
        if (d.status && d.status !== last.current) {
          last.current = d.status;
          router.refresh();
        }
      } catch {
        /* network blip — next tick retries */
      }
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [reservationId, initialStatus, router]);

  return null;
}
