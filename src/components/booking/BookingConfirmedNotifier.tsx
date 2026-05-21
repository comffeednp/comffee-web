"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

interface Props {
  reservationId: string;
  branchId: string;
  branchName: string;
  checkIn: string;
  checkOut: string;
}

const SESSIONS_KEY = "comffe.chat.sessions";

type SessionEntry = {
  key: string;
  sessionToken: string;
  conversationId: string;
  branchName?: string;
  checkIn?: string;
  checkOut?: string;
  updatedAt: string;
};

function getInquiryKey(branchId?: string, checkIn?: string, checkOut?: string): string {
  if (checkIn && checkOut) {
    return branchId
      ? `comffe.chat.v2.${branchId}.${checkIn}.${checkOut}`
      : `comffe.chat.v2.${checkIn}.${checkOut}`;
  }
  return branchId ? `comffe.chat.v2.${branchId}` : "comffe.chat.v2.general";
}

function loadSessions(): SessionEntry[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as SessionEntry[]; }
  catch { return []; }
}

function upsertSession(entry: SessionEntry) {
  const rest = loadSessions().filter((s) => s.key !== entry.key);
  rest.unshift(entry);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(rest.slice(0, 20)));
}

export default function BookingConfirmedNotifier({ reservationId, branchId, branchName, checkIn, checkOut }: Props) {
  useEffect(() => {
    const firedKey = `comffe.notified.${reservationId}`;
    if (typeof window === "undefined" || localStorage.getItem(firedKey)) return;

    (async () => {
      // Get auth user info for session context
      let authName: string | null = null;
      let avatarUrl: string | null = null;
      try {
        const supabase = getSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          authName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? null) as string | null;
          avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null) as string | null;
        }
      } catch {}

      // Try to find an existing session token for this booking
      const inquiryKey = getInquiryKey(branchId, checkIn, checkOut);
      const candidateKeys = [
        inquiryKey,
        getInquiryKey(undefined, checkIn, checkOut),
        "comffe.chat.v2.general",
      ];

      let sessionToken: string | null = null;
      for (const key of candidateKeys) {
        try {
          const stored = JSON.parse(localStorage.getItem(key) ?? "null") as { sessionToken?: string } | null;
          if (stored?.sessionToken) { sessionToken = stored.sessionToken; break; }
        } catch {}
      }

      // No prior session — create one now so the booking always appears in chat
      if (!sessionToken) {
        try {
          const startRes = await fetch("/api/chat/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerName: authName || undefined,
              branchId: branchId || undefined,
              branchName: branchName || undefined,
              checkIn: checkIn || undefined,
              checkOut: checkOut || undefined,
              avatarUrl: avatarUrl || undefined,
            }),
          });
          if (startRes.ok) {
            const data = await startRes.json() as { sessionToken?: string; conversationId?: string };
            if (data.sessionToken && data.conversationId) {
              sessionToken = data.sessionToken;
              localStorage.setItem(inquiryKey, JSON.stringify({ sessionToken, name: authName || undefined }));
              upsertSession({
                key: inquiryKey,
                sessionToken,
                conversationId: data.conversationId,
                branchName: branchName || undefined,
                checkIn: checkIn || undefined,
                checkOut: checkOut || undefined,
                updatedAt: new Date().toISOString(),
              });
            }
          }
        } catch {}
      }

      if (!sessionToken) return;

      localStorage.setItem(firedKey, "1");
      fetch("/api/chat/booking-confirmed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, reservationId }),
      }).catch(() => {});
    })();
  }, [reservationId, branchId, branchName, checkIn, checkOut]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
