import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminScope } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  honorPCReservationAction,
  cancelPCReservationAction,
  expirePCReservationAction,
} from "../../_actions/pc-reservations";
import { ArrowLeft, Check, Clock, X } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function PCReservationDetailPage({ params, searchParams }: Props) {
  const { branchId } = await getAdminScope();
  const { id } = await params;
  const { ok, error } = await searchParams;
  const supabase = await getSupabaseServer();

  const { data } = await supabase
    .from("pc_reservations")
    .select("*, branch:branches(name, slug), member:members(full_name, member_number)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  if (branchId && (data as { branch_id?: string | null }).branch_id !== branchId) notFound();

  const branch = (data as { branch?: { name: string; slug: string }[] | { name: string; slug: string } | null }).branch;
  const branchObj = Array.isArray(branch) ? branch[0] : branch;
  const member = (data as { member?: { full_name: string; member_number: string | null }[] | { full_name: string; member_number: string | null } | null }).member;
  const memberObj = Array.isArray(member) ? member[0] : member;

  const isPending = data.status === "pending" || data.status === "acknowledged";

  return (
    <section className="container-edge py-12 max-w-3xl">
      <Link
        href="/admin/pc-reservations"
        title="Back to all PC reservations"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        All PC reservations
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/pc-reservations/{data.id.slice(0, 8)}</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          {data.customer_name}
        </h1>
        <p className="mt-1 font-mono text-xs text-mocha">
          {data.customer_phone ?? "no phone"} · {data.customer_email ?? "no email"}
          {memberObj && (
            <> · member {memberObj.member_number ?? memberObj.full_name}</>
          )}
        </p>
      </div>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// {ok}</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Field label="branch" value={branchObj?.name ?? "—"} />
        <Field label="station" value={data.station_name ?? "any"} mono highlight />
        <Field label="arrive at" value={formatDateTime(data.reserved_for_start)} />
        <Field label="ends" value={formatDateTime(data.reserved_for_end)} />
        <Field label="duration" value={`${data.duration_minutes} min`} />
        <Field label="status" value={data.status} mono />
        <Field label="created" value={formatDateTime(data.created_at)} />
        {data.acknowledged_at && (
          <Field label="ack'd by sync" value={formatDateTime(data.acknowledged_at)} />
        )}
        {data.honored_at && (
          <Field label="honored at" value={formatDateTime(data.honored_at)} />
        )}
      </div>

      {data.notes && (
        <div className="mt-6 p-4 border border-line rounded-md bg-bg">
          <p className="terminal-label">// notes</p>
          <p className="mt-2 text-cream-dim text-sm whitespace-pre-line">{data.notes}</p>
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="mt-10">
          <p className="terminal-label">// actions</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <form action={honorPCReservationAction}>
              <input type="hidden" name="id" value={data.id} />
              <button type="submit" title="Mark as honored — customer has arrived" className="key-cap key-cap-primary">
                <Check className="h-3.5 w-3.5" />
                Honor (customer arrived)
              </button>
            </form>
            <form action={expirePCReservationAction}>
              <input type="hidden" name="id" value={data.id} />
              <button
                type="submit"
                title="Mark as expired — customer did not show up"
                className="inline-flex items-center gap-2 border border-line-bright rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-cream-dim hover:text-amber hover:border-amber/60"
              >
                <Clock className="h-3.5 w-3.5" />
                Mark expired (no-show)
              </button>
            </form>
            <form action={cancelPCReservationAction}>
              <input type="hidden" name="id" value={data.id} />
              <button
                type="submit"
                title="Cancel this PC reservation"
                className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </form>
          </div>
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
