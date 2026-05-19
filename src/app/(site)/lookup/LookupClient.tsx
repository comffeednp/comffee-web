"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Coffee,
  MapPin,
  Power,
  Search,
  Users,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { formatPHP, formatDateTime } from "@/lib/utils";
import { formatRange } from "@/lib/dates";

interface ReservationResult {
  id: string;
  status: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_php: number;
  guest_name: string;
  branch: { name: string; slug: string } | null;
}

interface OrderResult {
  id: string;
  status: string;
  payment_status: string;
  total_php: number;
  scheduled_for: string | null;
  customer_name: string;
  branch: { name: string } | null;
  items: Array<{ name_snapshot: string; qty: number; line_total: number }>;
}

type LookupResult =
  | { kind: "reservation"; data: ReservationResult }
  | { kind: "order"; data: OrderResult };

interface Props {
  initialId: string;
}

export default function LookupClient({ initialId }: Props) {
  const [id, setId] = useState(initialId);
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!id.trim() || !contact.trim()) {
      setError("Both fields are required");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.trim(), contact: contact.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("No matching record. Check the ID and contact, or contact us for help.");
        return;
      }
      setResult(data as LookupResult);
    } catch {
      setError("Network error — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-focus contact field if id was prefilled from query string
  useEffect(() => {
    if (initialId) {
      const el = document.getElementById("lookup-contact") as HTMLInputElement | null;
      el?.focus();
    }
  }, [initialId]);

  return (
    <div className="space-y-10">
      <form
        onSubmit={handleSubmit}
        className="border border-line-bright bg-bg-card rounded-2xl p-6 md:p-8 space-y-5"
      >
        <label className="block">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
            // reservation or order id
          </span>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="paste the long id from your email"
            className="mt-2 w-full bg-bg border border-line-bright rounded-lg px-4 py-3 font-mono text-sm text-cream focus:outline-none focus:border-amber"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
            // email or phone you used
          </span>
          <input
            id="lookup-contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="you@example.com or +63 9XX XXX XXXX"
            className="mt-2 w-full bg-bg border border-line-bright rounded-lg px-4 py-3 font-mono text-sm text-cream focus:outline-none focus:border-amber"
            autoComplete="off"
          />
        </label>

        {error && (
          <div className="flex items-start gap-2 p-3 border border-red-700/50 rounded-lg bg-red-950/10">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="font-mono text-xs text-red-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !id.trim() || !contact.trim()}
          className="key-cap key-cap-primary w-full justify-center disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking up
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Look up
            </>
          )}
        </button>
      </form>

      {result && (
        <div className="border border-amber/40 bg-bg-card rounded-2xl p-6 md:p-8 glow-amber">
          {result.kind === "reservation" ? (
            <ReservationView data={result.data} />
          ) : (
            <OrderView data={result.data} />
          )}
        </div>
      )}
    </div>
  );
}

function ReservationView({ data }: { data: ReservationResult }) {
  const isConfirmed = data.status === "confirmed";
  return (
    <div>
      <p className="terminal-label">// playcation_booking</p>
      <h2 className="mt-2 font-display text-3xl md:text-4xl font-bold text-cream">
        {data.branch?.name ?? "Comffee Playcation"}
      </h2>
      <p
        className={`mt-2 font-mono text-sm font-bold ${
          isConfirmed ? "text-phosphor text-glow-phosphor" : "text-amber"
        }`}
      >
        {isConfirmed ? "▶ CONFIRMED" : data.status === "pending_hold" ? "◔ HOLD ACTIVE" : `· ${data.status}`}
      </p>

      <div className="mt-6 space-y-3">
        <Row icon={Calendar} label="dates" value={formatRange(data.check_in, data.check_out)} />
        <Row icon={Users} label="guests" value={String(data.num_guests)} />
        <Row icon={MapPin} label="branch" value={data.branch?.name ?? "—"} />
      </div>

      <div className="mt-6 pt-6 border-t border-line flex items-baseline justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
          // total
        </span>
        <span className="text-3xl font-display font-bold text-amber">
          {formatPHP(Number(data.total_php))}
        </span>
      </div>

      <p className="mt-4 font-mono text-[0.65rem] text-mocha break-all">
        // id: {data.id}
      </p>
    </div>
  );
}

function OrderView({ data }: { data: OrderResult }) {
  const isPaid = data.payment_status === "paid";
  return (
    <div>
      <p className="terminal-label">// menu_order</p>
      <h2 className="mt-2 font-display text-3xl md:text-4xl font-bold text-cream">
        {data.branch?.name ?? "Comffee"}
      </h2>
      <p
        className={`mt-2 font-mono text-sm font-bold ${
          isPaid ? "text-phosphor text-glow-phosphor" : "text-amber"
        }`}
      >
        {isPaid ? `▶ PAID · ${data.status.toUpperCase()}` : `◔ ${data.payment_status.toUpperCase()}`}
      </p>

      <div className="mt-6 space-y-3">
        {data.scheduled_for && (
          <Row icon={Power} label="ready by" value={formatDateTime(data.scheduled_for)} />
        )}
        <Row icon={Coffee} label="items" value={`${data.items.length} line${data.items.length === 1 ? "" : "s"}`} />
      </div>

      <div className="mt-6 pt-6 border-t border-line">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha mb-3">
          // line_items
        </p>
        <ul className="space-y-2">
          {data.items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between font-mono text-sm"
            >
              <span className="text-cream">× {it.qty} {it.name_snapshot}</span>
              <span className="text-cream-dim">{formatPHP(Number(it.line_total))}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 pt-6 border-t border-line flex items-baseline justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
          // total
        </span>
        <span className="text-3xl font-display font-bold text-amber">
          {formatPHP(Number(data.total_php))}
        </span>
      </div>

      <p className="mt-4 font-mono text-[0.65rem] text-mocha break-all">
        // id: {data.id}
      </p>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-sm">
      <span className="flex items-center gap-2 text-mocha uppercase tracking-widest text-[0.65rem]">
        <Icon className="h-3 w-3 text-amber" />
        {label}
      </span>
      <span className="text-cream text-right">{value}</span>
    </div>
  );
}
