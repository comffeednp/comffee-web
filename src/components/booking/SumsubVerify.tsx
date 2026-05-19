"use client";

import { useEffect, useState } from "react";
import SumsubWebSdk from "@sumsub/websdk-react";

interface Props {
  userId: string;
  onComplete: () => void;
  onFail: (msg: string) => void;
}

export default function SumsubVerify({ userId, onComplete, onFail }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchToken = async (): Promise<string> => {
    const res = await fetch("/api/sumsub/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error("token_fetch_failed");
    const data = (await res.json()) as { token: string };
    return data.token;
  };

  useEffect(() => {
    fetchToken()
      .then(setToken)
      .catch(() => onFail("Could not start identity verification. Please try again."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (loading) {
    return (
      <div className="py-16 text-center font-mono text-sm text-cream-dim">
        // loading verification...
      </div>
    );
  }

  if (!token) return null;

  return (
    <SumsubWebSdk
      accessToken={token}
      expirationHandler={fetchToken}
      config={{ lang: "en" }}
      options={{ addViewportTag: false, adaptIframeHeight: true }}
      onMessage={(type: string, payload: unknown) => {
        if (type === "idCheck.onApplicantSubmitted") {
          onComplete();
        }
        if (
          type === "idCheck.onApplicantStatusChanged" &&
          (payload as { reviewResult?: { reviewAnswer?: string } })?.reviewResult
            ?.reviewAnswer === "GREEN"
        ) {
          onComplete();
        }
      }}
      onError={(data: unknown) => {
        console.error("sumsub sdk error", data);
        onFail("Verification error. Please refresh and try again.");
      }}
    />
  );
}
