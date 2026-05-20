"use client";

import { useEffect } from "react";

interface Props {
  reservationId: string;
  branchId: string;
  checkIn: string;
  checkOut: string;
}

export default function BookingConfirmedNotifier({ reservationId, branchId, checkIn, checkOut }: Props) {
  useEffect(() => {
    const firedKey = `comffe.notified.${reservationId}`;
    if (typeof window === "undefined" || localStorage.getItem(firedKey)) return;

    // Reconstruct the inquiry key to find the right session token
    const getInquiryKey = (bid?: string | null, ci?: string | null, co?: string | null) => {
      if (ci && co) return bid ? `comffe.chat.v2.${bid}.${ci}.${co}` : `comffe.chat.v2.${ci}.${co}`;
      return bid ? `comffe.chat.v2.${bid}` : "comffe.chat.v2.general";
    };

    // Try branch+dates key first, then dates-only key, then general
    const keys = [
      getInquiryKey(branchId, checkIn, checkOut),
      getInquiryKey(null, checkIn, checkOut),
      "comffe.chat.v2.general",
    ];

    let sessionToken: string | null = null;
    for (const key of keys) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "null") as { sessionToken?: string } | null;
        if (stored?.sessionToken) { sessionToken = stored.sessionToken; break; }
      } catch {}
    }

    if (!sessionToken) return;

    localStorage.setItem(firedKey, "1");
    fetch("/api/chat/booking-confirmed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken, reservationId }),
    }).catch(() => {});
  }, [reservationId, branchId, checkIn, checkOut]);

  return null;
}
