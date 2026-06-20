"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { formatPHP } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Hand,
  KeyRound,
  Loader2,
  XCircle,
} from "lucide-react";
import { claimOrderAction, releaseOrderAction, failOrderAction } from "./_actions";

interface LineRow {
  id: string;
  vp: number;
  status: string;
  position: number;
}
interface OrderRow {
  id: string;
  game: string;
  region: string;
  riotId: string;
  tag: string;
  targetVp: number;
  fulfilledVp: number;
  amountPhp: number;
  status: string;
  ocrText: string | null;
  claimedAt: string | null;
  createdAt: string;
  screenshotUrl: string | null;
  lines: LineRow[];
}
interface OtpRow {
  id: string;
  otp: string;
  sim: string | null;
  createdAt: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
      className="inline-flex items-center gap-1 rounded border border-line-bright bg-bg px-2 py-1 font-mono text-xs text-cream hover:border-amber/60"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-phosphor" /> : <Copy className="h-3 w-3 text-amber" />}
      {copied ? "copied" : "copy"}
    </button>
  );
}

export default function ConsoleClient({ orders, otps }: { orders: OrderRow[]; otps: OtpRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failFor, setFailFor] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");

  // Live refresh: any change to orders / lines / OTPs re-runs the server component (debounced).
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowser();
    } catch {
      return;
    }
    const refresh = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel("game-topups-console")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_topup_orders" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_topup_order_lines" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_topup_otp_relay" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [router]);

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* Queue */}
      <div className="space-y-4">
        {orders.length === 0 && (
          <div className="rounded-xl border border-line bg-bg-card p-8 text-center font-mono text-xs text-mocha">
            // no paid orders waiting
          </div>
        )}
        {orders.map((o) => {
          const ageMin = Math.max(0, Math.round((Date.now() - new Date(o.createdAt).getTime()) / 60000));
          const flagged = o.ocrText?.includes("manual review");
          return (
            <div
              key={o.id}
              className={`rounded-xl border bg-bg-card p-4 ${o.status === "processing" ? "border-amber" : "border-line-bright"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold text-cream">
                      {o.riotId}<span className="text-mocha">#{o.tag}</span>
                    </span>
                    <CopyButton value={`${o.riotId}#${o.tag}`} label="Riot ID + tag" />
                  </div>
                  <p className="mt-1 font-mono text-xs uppercase text-mocha">
                    {o.game} · {o.region} · {o.targetVp.toLocaleString()} VP · {formatPHP(o.amountPhp)} · {ageMin}m ago
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-1 font-mono text-[0.65rem] uppercase ${
                      o.status === "processing" ? "bg-amber/15 text-amber" : "bg-bg text-cream-dim"
                    }`}
                  >
                    {o.status}
                  </span>
                  {flagged && (
                    <span className="rounded bg-rgb-r/15 px-2 py-1 font-mono text-[0.65rem] uppercase text-rgb-r" title="Screenshot couldn't be auto-checked — eyeball it">
                      review
                    </span>
                  )}
                </div>
              </div>

              {/* Combo checklist */}
              <ul className="mt-3 space-y-1.5">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded-lg border border-line bg-bg px-3 py-2">
                    <span className="flex items-center gap-2 font-mono text-sm text-cream">
                      {l.status === "verified" ? (
                        <CheckCircle2 className="h-4 w-4 text-phosphor" />
                      ) : (
                        <Clock className="h-4 w-4 text-mocha" />
                      )}
                      {l.vp.toLocaleString()} VP
                    </span>
                    {l.status === "verified" ? (
                      <span className="font-mono text-[0.65rem] uppercase text-phosphor">delivered</span>
                    ) : (
                      <span className="font-mono text-[0.65rem] uppercase text-mocha">awaiting confirmation</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {o.status === "pending" ? (
                  <button
                    type="button"
                    title="Claim this order (mark processing)"
                    disabled={pending}
                    onClick={() => act(() => claimOrderAction(o.id))}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber bg-amber/10 px-3 py-1.5 font-mono text-xs text-amber hover:bg-amber/20 disabled:opacity-50"
                  >
                    <Hand className="h-3.5 w-3.5" /> Claim
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Release this order back to the queue"
                    disabled={pending}
                    onClick={() => act(() => releaseOrderAction(o.id))}
                    className="inline-flex items-center gap-1 rounded-lg border border-line-bright bg-bg px-3 py-1.5 font-mono text-xs text-cream-dim hover:border-amber/60 disabled:opacity-50"
                  >
                    Release
                  </button>
                )}

                {o.screenshotUrl && (
                  <a
                    href={o.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open the customer's screenshot"
                    className="inline-flex items-center gap-1 rounded-lg border border-line-bright bg-bg px-3 py-1.5 font-mono text-xs text-cream-dim hover:border-amber/60"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> screenshot
                  </a>
                )}

                {failFor === o.id ? (
                  <span className="inline-flex items-center gap-2">
                    <input
                      value={failReason}
                      onChange={(e) => setFailReason(e.target.value)}
                      placeholder="reason"
                      className="rounded border border-line-bright bg-bg px-2 py-1 font-mono text-xs text-cream"
                    />
                    <button
                      type="button"
                      title="Confirm marking this order failed (needs manual refund)"
                      disabled={pending}
                      onClick={() =>
                        act(async () => {
                          await failOrderAction(o.id, failReason || "undeliverable");
                          setFailFor(null);
                          setFailReason("");
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-rgb-r/50 bg-rgb-r/10 px-3 py-1.5 font-mono text-xs text-rgb-r hover:bg-rgb-r/20 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> confirm fail
                    </button>
                    <button
                      type="button"
                      title="Cancel"
                      onClick={() => {
                        setFailFor(null);
                        setFailReason("");
                      }}
                      className="font-mono text-xs text-mocha hover:text-cream"
                    >
                      cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    title="Mark this order as failed (flag for manual refund)"
                    onClick={() => setFailFor(o.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-line-bright bg-bg px-3 py-1.5 font-mono text-xs text-mocha hover:border-rgb-r/60 hover:text-rgb-r"
                  >
                    <XCircle className="h-3.5 w-3.5" /> can&rsquo;t deliver
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live OTP panel */}
      <div className="space-y-3 rounded-xl border border-line-bright bg-bg-card p-4 lg:sticky lg:top-24 lg:self-start">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-mocha">
          <KeyRound className="h-3.5 w-3.5 text-amber" /> live OTPs (last 5 min)
        </p>
        {otps.length === 0 ? (
          <p className="font-mono text-xs text-mocha">// waiting for an OTP…</p>
        ) : (
          <ul className="space-y-2">
            {otps.map((t) => {
              const ageSec = Math.max(0, Math.round((Date.now() - new Date(t.createdAt).getTime()) / 1000));
              return (
                <li key={t.id} className="flex items-center justify-between rounded-lg border border-line bg-bg px-3 py-2">
                  <span>
                    <span className="font-mono text-lg font-bold tracking-widest text-amber">{t.otp}</span>
                    <span className="ml-2 font-mono text-[0.6rem] uppercase text-mocha">
                      {t.sim ? `${t.sim} · ` : ""}{ageSec}s
                    </span>
                  </span>
                  <CopyButton value={t.otp} label="OTP" />
                </li>
              );
            })}
          </ul>
        )}
        {pending && (
          <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase text-mocha">
            <Loader2 className="h-3 w-3 animate-spin" /> working…
          </p>
        )}
      </div>
    </div>
  );
}
