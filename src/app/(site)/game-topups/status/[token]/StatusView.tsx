"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import type { ViewGroup } from "@/lib/game-topups/grouping";

interface OrderRow {
  targetVp: number;
  fulfilledVp: number;
  amountPhp: number;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
}
interface Payload {
  order: OrderRow;
  groups: ViewGroup[];
}

const TERMINAL = new Set(["delivered", "refunded", "failed"]);

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  draft: { label: "Not paid yet", tone: "text-mocha" },
  verified: { label: "Account verified — awaiting payment", tone: "text-cream-dim" },
  pending: { label: "Paid — queued for delivery", tone: "text-amber" },
  processing: { label: "Delivering now…", tone: "text-amber" },
  delivered: { label: "Delivered — complete", tone: "text-phosphor" },
  failed: { label: "Couldn't complete — a refund is being arranged", tone: "text-rgb-r" },
  refunded: { label: "Refunded", tone: "text-cream-dim" },
};

export default function StatusView({ token, initial }: { token: string; initial: Payload }) {
  const [data, setData] = useState<Payload>(initial);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (TERMINAL.has(data.order.status)) return; // nothing more will change
    const poll = async () => {
      try {
        const res = await fetch(`/api/game-topup/status/${token}`, { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as Payload;
          setData(next);
          if (TERMINAL.has(next.order.status) && timer.current) clearInterval(timer.current);
        }
      } catch {
        /* transient — keep polling */
      }
    };
    timer.current = setInterval(poll, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [token, data.order.status]);

  const o = data.order;
  const copy = STATUS_COPY[o.status] ?? { label: o.status, tone: "text-cream-dim" };
  const accounts = data.groups.map((g) => `${g.gameName} · ${g.accountLabel}`).join(" · ");

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-line-bright bg-bg-card p-6 md:p-10">
      <div className="flex items-center gap-3">
        {o.status === "delivered" ? (
          <CheckCircle2 className="h-8 w-8 text-phosphor" />
        ) : o.status === "failed" || o.status === "refunded" ? (
          <XCircle className="h-8 w-8 text-rgb-r" />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-amber" />
        )}
        <div className="min-w-0">
          <p className={`font-display text-xl font-bold ${copy.tone}`}>{copy.label}</p>
          <p className="truncate font-mono text-xs text-mocha">{accounts}</p>
        </div>
      </div>

      {/* One block per (game, account) */}
      <div className="space-y-5">
        {data.groups.map((g, gi) => (
          <div key={gi} className="rounded-xl border border-line bg-bg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-sm font-bold text-cream">
                {g.gameName} <span className="font-mono text-xs font-normal text-mocha">· {g.accountLabel}</span>
              </p>
              <span className="font-mono text-xs text-cream-dim">
                {g.fulfilledVp.toLocaleString()} / {g.targetVp.toLocaleString()} {g.currencyLabel}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line-bright">
              <div
                className="h-full rounded-full bg-amber transition-all"
                style={{ width: `${g.targetVp > 0 ? Math.min(100, (g.fulfilledVp / g.targetVp) * 100) : 0}%` }}
              />
            </div>
            <ul className="mt-3 space-y-2">
              {g.lines.map((l, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-line bg-bg-card px-4 py-2.5">
                  <span className="flex items-center gap-2 font-mono text-sm text-cream">
                    {l.status === "verified" ? (
                      <CheckCircle2 className="h-4 w-4 text-phosphor" />
                    ) : (
                      <Clock className="h-4 w-4 text-mocha" />
                    )}
                    {l.vp.toLocaleString()} {g.currencyLabel}
                  </span>
                  <span className={`font-mono text-xs ${l.status === "verified" ? "text-phosphor" : "text-mocha"}`}>
                    {l.status === "verified" ? "delivered" : "waiting…"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-line-bright pt-4">
        <span className="font-mono text-sm text-cream-dim">Amount paid</span>
        <span className="font-display text-xl font-bold text-amber">{formatPHP(o.amountPhp)}</span>
      </div>

      {!TERMINAL.has(o.status) && (
        <p className="text-center font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
          // this page updates automatically
        </p>
      )}
    </div>
  );
}
