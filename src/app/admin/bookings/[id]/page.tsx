import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminScope } from "@/lib/auth/require-admin";
import { getReservationById } from "@/lib/reservations";
import {
  manualConfirmAction,
  cancelBookingAction,
  approveBookingAction,
  rejectBookingAction,
  resendConfirmationAction,
} from "../../_actions/bookings";
import { getSupabaseServer } from "@/lib/supabase/server";
import RefundButton from "@/components/admin/RefundButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { ArrowLeft, Check, X } from "lucide-react";
import { formatDate, formatDateTime, formatPHP } from "@/lib/utils";
import { nightsBetween } from "@/lib/dates";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function BookingDetailPage({ params, searchParams }: Props) {
  const { branchId } = await getAdminScope();
  const { id } = await params;
  const { ok, error } = await searchParams;
  const reservation = await getReservationById(id);
  if (!reservation) notFound();
  if (branchId && (reservation as { branch_id?: string | null }).branch_id !== branchId) notFound();

  const branch = (reservation as { branch?: { slug: string; name: string } | null }).branch;
  const nights = nightsBetween(reservation.check_in, reservation.check_out);

  // Sum of succeeded refunds for this reservation
  const supabase = await getSupabaseServer();
  const { data: refundRows } = await supabase
    .from("refunds")
    .select("amount_php, status, reason, created_at")
    .eq("reservation_id", id)
    .order("created_at", { ascending: false });
  const refunds = refundRows ?? [];
  const alreadyRefunded = refunds
    .filter((r) => r.status === "succeeded")
    .reduce((s, r) => s + Number(r.amount_php), 0);

  return (
    <section className="container-edge py-12 max-w-3xl">
      <Link
        href="/admin/bookings"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        All bookings
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/bookings/{reservation.id.slice(0, 8)}</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          {reservation.guest_name ?? "—"}
        </h1>
      </div>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// {ok}</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Field label="branch" value={branch?.name ?? "—"} />
        <Field label="status" value={reservation.status} mono />
        <Field label="source" value={reservation.source} mono />
        <Field label="payment" value={reservation.paymongo_intent_id ? "via PayMongo" : "—"} />
        <Field label="check-in" value={formatDate(reservation.check_in)} />
        <Field label="check-out" value={formatDate(reservation.check_out)} />
        <Field label="nights" value={String(nights)} />
        <Field label="guests" value={String(reservation.num_guests ?? 1)} />
        <Field label="email" value={reservation.guest_email ?? "—"} />
        <Field label="phone" value={reservation.guest_phone ?? "—"} />
        <Field label="total" value={formatPHP(reservation.total_php ?? 0)} highlight />
        <Field label="created" value={formatDateTime(reservation.created_at)} />
        {reservation.hold_expires_at && (
          <Field label="hold expires" value={formatDateTime(reservation.hold_expires_at)} />
        )}
        {reservation.paymongo_intent_id && (
          <Field label="paymongo id" value={reservation.paymongo_intent_id} mono />
        )}
      </div>

      {reservation.notes && (
        <div className="mt-8 p-4 border border-line rounded-md bg-bg">
          <p className="terminal-label">// notes</p>
          <p className="mt-2 text-cream-dim text-sm whitespace-pre-line">{reservation.notes}</p>
        </div>
      )}

      {reservation.status === "cancelled" && (
        <div className="mt-10 p-4 border border-red-700/40 bg-red-950/10 rounded-lg">
          <p className="font-mono text-xs text-red-400 uppercase tracking-widest">// terminal state</p>
          <p className="mt-1 text-sm text-cream-dim">
            This booking is permanently cancelled. It cannot be reinstated — the customer must complete a new booking and payment.
          </p>
        </div>
      )}

      {/* Request-to-book: a paid booking waiting for the owner's decision. */}
      {reservation.status === "pending_approval" && (
        <div className="mt-10 p-5 border border-amber/50 bg-amber/5 rounded-xl">
          <p className="font-mono text-xs text-amber uppercase tracking-widest">// awaiting your decision</p>
          <p className="mt-1 text-sm text-cream-dim">
            {reservation.guest_name ?? "The guest"} paid{" "}
            <span className="text-amber font-semibold">{formatPHP(Number(reservation.total_php ?? 0))}</span>{" "}
            and is waiting. Accept to confirm + email them their booking, or decline to refund in full and reopen the dates.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ConfirmSubmitButton
              action={approveBookingAction}
              id={reservation.id}
              confirmText={`Accept this booking? ${reservation.guest_name ?? "The guest"} will be confirmed and emailed.`}
              title="Accept and confirm this booking"
              className="key-cap key-cap-phosphor"
            >
              <Check className="h-4 w-4" />
              Accept
            </ConfirmSubmitButton>
            <ConfirmSubmitButton
              action={rejectBookingAction}
              id={reservation.id}
              reason="Booking request declined by host"
              confirmText={`Decline this booking? ${reservation.guest_name ?? "The guest"} will be refunded in full and the dates reopened.`}
              title="Decline this booking and refund the guest"
              className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
            >
              <X className="h-3.5 w-3.5" />
              Reject &amp; refund
            </ConfirmSubmitButton>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {reservation.status !== "confirmed" &&
          reservation.status !== "cancelled" &&
          reservation.status !== "pending_approval" && (
            <form action={manualConfirmAction}>
              <input type="hidden" name="id" value={reservation.id} />
              <button type="submit" title="Manually confirm this booking" className="key-cap key-cap-phosphor">
                <Check className="h-4 w-4" />
                Manually confirm
              </button>
            </form>
          )}
        {reservation.status === "confirmed" && reservation.guest_email && (
          <form action={resendConfirmationAction}>
            <input type="hidden" name="id" value={reservation.id} />
            <button
              type="submit"
              title="Re-send the confirmation email + chat message to the guest"
              className="inline-flex items-center gap-2 border border-line-bright rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-cream-dim hover:text-amber hover:border-amber"
            >
              <Check className="h-3.5 w-3.5" />
              Resend confirmation
            </button>
          </form>
        )}
        {reservation.status !== "cancelled" && reservation.status !== "pending_approval" && (
          <form action={cancelBookingAction}>
            <input type="hidden" name="id" value={reservation.id} />
            <input type="hidden" name="reason" value="cancelled by admin" />
            <button
              type="submit"
              title="Cancel this booking"
              className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* REFUNDS */}
      {(reservation.status === "confirmed" || reservation.status === "cancelled" || refunds.length > 0) && Number(reservation.total_php ?? 0) > 0 && (
        <div className="mt-10 p-6 border border-line-bright rounded-xl bg-bg-card">
          <p className="terminal-label">// refunds</p>
          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-cream-dim">
              Paid {formatPHP(Number(reservation.total_php ?? 0))}
              {alreadyRefunded > 0 && <> · refunded {formatPHP(alreadyRefunded)}</>}
            </p>
            <RefundButton
              reservationId={reservation.id}
              totalPhp={Number(reservation.total_php ?? 0)}
              alreadyRefunded={alreadyRefunded}
              guestPhone={reservation.guest_phone ?? null}
            />
          </div>
          {refunds.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {refunds.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm font-mono"
                >
                  <span className="text-cream-dim">
                    {formatDateTime(r.created_at as string)}
                    {r.reason && ` · ${r.reason}`}
                  </span>
                  <span
                    className={`${
                      r.status === "succeeded"
                        ? "text-phosphor"
                        : r.status === "failed"
                        ? "text-red-400"
                        : "text-amber"
                    }`}
                  >
                    -{formatPHP(Number(r.amount_php))} · {r.status as string}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
          highlight ? "text-amber text-xl font-bold" : "text-cream"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
