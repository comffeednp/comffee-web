import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  confirmInternetReservationAction,
  startTimerAction,
  stopTimerAction,
  extendTimerAction,
  cancelInternetReservationAction,
  setPrepaidAction,
} from "../../_actions/internet-reservations";
import LiveTimer from "@/components/admin/LiveTimer";
import { ArrowLeft, Check, Clock, Plus, Power, Square, X } from "lucide-react";
import { formatDateTime, formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function AdminInternetReservationDetailPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const supabase = await getSupabaseServer();
  const { data: reservation } = await supabase
    .from("internet_reservations")
    .select(
      "*, member:members(full_name, email, phone, member_number), branch:branches(name, slug)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!reservation) notFound();

  const branch = (reservation as { branch?: { name: string; slug: string } | null }).branch;
  const member = (reservation as {
    member?: { full_name: string; email: string | null; phone: string | null; member_number: string | null } | null;
  }).member;

  // Total session minutes = requested duration + extensions
  const requestedMs =
    new Date(reservation.requested_end).getTime() -
    new Date(reservation.requested_start).getTime();
  const requestedMinutes = Math.round(requestedMs / 60000);
  const totalMinutes = requestedMinutes + (reservation.time_extended_minutes ?? 0);

  return (
    <section className="container-edge py-12 max-w-3xl">
      <Link
        href="/admin/internet-reservations"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        All reservations
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/internet-reservations/{reservation.id.slice(0, 8)}</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          {member?.full_name ?? "—"}
        </h1>
        <p className="mt-1 font-mono text-xs text-mocha">
          {member?.member_number ?? "—"} · {member?.phone ?? "no phone"} · {member?.email ?? "no email"}
        </p>
      </div>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// {ok.replaceAll("_", " ")}</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      {/* LIVE TIMER (active sessions only) */}
      {reservation.status === "active" && reservation.actual_start && (
        <div className="mt-10">
          <LiveTimer
            startedAt={reservation.actual_start}
            totalMinutes={totalMinutes}
          />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <form action={extendTimerAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <input type="hidden" name="minutes" value="15" />
              <button type="submit" className="key-cap !py-2 !px-3">
                <Plus className="h-3.5 w-3.5" />
                +15 min
              </button>
            </form>
            <form action={extendTimerAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <input type="hidden" name="minutes" value="30" />
              <button type="submit" className="key-cap !py-2 !px-3">
                <Plus className="h-3.5 w-3.5" />
                +30 min
              </button>
            </form>
            <form action={extendTimerAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <input type="hidden" name="minutes" value="60" />
              <button type="submit" className="key-cap !py-2 !px-3">
                <Plus className="h-3.5 w-3.5" />
                +1 hr
              </button>
            </form>
            <form action={stopTimerAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <button type="submit" className="key-cap key-cap-primary">
                <Square className="h-3.5 w-3.5" />
                Stop session
              </button>
            </form>
          </div>
        </div>
      )}

      {/* facts */}
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Field label="branch" value={branch?.name ?? "—"} />
        <Field label="station" value={reservation.station_label} mono />
        <Field label="requested from" value={formatDateTime(reservation.requested_start)} />
        <Field label="requested until" value={formatDateTime(reservation.requested_end)} />
        <Field label="status" value={reservation.status} mono highlight={reservation.status === "active"} />
        <Field label="duration (req)" value={`${requestedMinutes} min`} />
        {reservation.time_extended_minutes > 0 && (
          <Field
            label="extensions"
            value={`+${reservation.time_extended_minutes} min`}
            highlight
          />
        )}
        {reservation.actual_start && (
          <Field label="actual start" value={formatDateTime(reservation.actual_start)} />
        )}
        {reservation.actual_end && (
          <Field label="actual end" value={formatDateTime(reservation.actual_end)} />
        )}
        <Field label="prepaid" value={formatPHP(Number(reservation.prepaid_php ?? 0))} />
      </div>

      {reservation.notes && (
        <div className="mt-6 p-4 border border-line rounded-md bg-bg">
          <p className="terminal-label">// notes</p>
          <p className="mt-2 text-cream-dim text-sm whitespace-pre-line">{reservation.notes}</p>
        </div>
      )}

      {/* TRANSITIONS */}
      <div className="mt-10">
        <p className="terminal-label">// actions</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {reservation.status === "requested" && (
            <form action={confirmInternetReservationAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <button type="submit" className="key-cap key-cap-phosphor">
                <Check className="h-3.5 w-3.5" />
                Confirm request
              </button>
            </form>
          )}
          {(reservation.status === "confirmed" || reservation.status === "requested") && (
            <form action={startTimerAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <button type="submit" className="key-cap key-cap-primary">
                <Power className="h-3.5 w-3.5" />
                Start timer now
              </button>
            </form>
          )}
          {reservation.status !== "cancelled" && reservation.status !== "completed" && (
            <form action={cancelInternetReservationAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      {/* PREPAID */}
      <div className="mt-10 p-5 border border-line-bright rounded-xl bg-bg-card">
        <p className="terminal-label">// prepaid amount</p>
        <p className="mt-2 text-sm text-cream-dim">
          Track how much the member has paid towards this session (cash, GCash, etc.).
        </p>
        <form action={setPrepaidAction} className="mt-4 flex items-center gap-3">
          <input type="hidden" name="id" value={reservation.id} />
          <input
            name="prepaid_php"
            type="number"
            step="0.01"
            min="0"
            defaultValue={reservation.prepaid_php ?? 0}
            className="form-input max-w-[10rem]"
          />
          <button type="submit" className="key-cap !py-2 !px-3">
            <Clock className="h-3.5 w-3.5" />
            Update
          </button>
        </form>
      </div>

      <style>{`
        .form-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-mono);
          font-size: 0.9rem;
        }
        .form-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="p-4 border border-line rounded-md bg-bg">
      <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">// {label}</p>
      <p
        className={`mt-1 ${mono ? "font-mono text-sm" : ""} ${
          highlight ? "text-amber font-bold" : "text-cream"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
