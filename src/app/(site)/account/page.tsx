import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelMyReservationAction } from "./_actions/reservations";
import { Calendar, Cpu, Gamepad2, Plus, Trash2 } from "lucide-react";
import { formatDateTime, formatPHP } from "@/lib/utils";
import { formatRange, nightsBetween } from "@/lib/dates";

export const dynamic = "force-dynamic";

interface InternetReservation {
  id: string;
  branch_id: string;
  station_label: string;
  requested_start: string;
  requested_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  branch: { name: string; slug: string } | null;
}

interface PlaycationBooking {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  total_php: number | null;
  num_guests: number | null;
  branch: { name: string; slug: string } | null;
}

interface Props {
  searchParams: Promise<{ ok?: string }>;
}

export default async function AccountPage({ searchParams }: Props) {
  const member = await requireMember();
  const { ok } = await searchParams;

  const admin = getSupabaseAdmin();

  const { data: playcationData } = await admin
    .from("reservations")
    .select("id, check_in, check_out, status, total_php, num_guests, branch:branches(name, slug)")
    .eq("member_id", member.id)
    .in("status", ["pending_hold", "confirmed", "cancelled"])
    .order("check_in", { ascending: false })
    .limit(20);
  const playcationBookings = (playcationData ?? []) as unknown as PlaycationBooking[];

  const { data } = await admin
    .from("internet_reservations")
    .select("*, branch:branches(name, slug)")
    .eq("member_id", member.id)
    .order("requested_start", { ascending: false })
    .limit(50);
  const reservations = (data ?? []) as unknown as InternetReservation[];

  return (
    <section className="container-edge py-12 max-w-4xl">
      <p className="terminal-label">/account</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl font-bold text-cream tracking-tight">
        Welcome back, {member.full_name.split(" ")[0]}.
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Member since {new Date(member.joined_at).getFullYear()} ·{" "}
        <span className="font-mono text-amber">{member.member_number}</span> ·{" "}
        <Link href="/account/profile" className="text-amber hover:underline">edit profile</Link>
      </p>

      {ok && (
        <p className="mt-4 font-mono text-xs text-phosphor">// {ok.replaceAll("_", " ")}</p>
      )}

      {/* Playcation bookings */}
      {playcationBookings.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-5">
            <Gamepad2 className="h-5 w-5 text-amber" />
            <h2 className="font-display text-2xl font-bold text-cream">Playcation stays</h2>
          </div>
          <ul className="space-y-3">
            {playcationBookings.map((r) => {
              const nights = nightsBetween(r.check_in, r.check_out);
              return (
                <li key={r.id} className="p-5 border border-line-bright bg-bg-card rounded-xl">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-display font-semibold text-cream">
                          {r.branch?.name ?? "Comffee Playcation"}
                        </span>
                        <StatusChip status={r.status} />
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-cream-dim font-mono">
                        <Calendar className="h-3 w-3" />
                        {formatRange(r.check_in, r.check_out)} · {nights} night{nights !== 1 ? "s" : ""}
                        {r.num_guests && ` · ${r.num_guests} guest${r.num_guests !== 1 ? "s" : ""}`}
                      </div>
                      <p className="mt-1 font-mono text-xs text-amber">
                        {r.total_php != null ? formatPHP(r.total_php) : "—"}
                      </p>
                    </div>
                    {r.branch?.slug && (
                      <Link
                        href={`/playcation/${r.branch.slug}/confirmed/${r.id}`}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-amber hover:underline shrink-0"
                      >
                        View receipt →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-10 flex items-end justify-between gap-6">
        <h2 className="font-display text-2xl font-bold text-cream">
          Your station reservations
        </h2>
        <Link href="/account/reservations/new" className="key-cap key-cap-primary !py-2 !px-4">
          <Plus className="h-4 w-4" />
          New request
        </Link>
      </div>

      <ul className="mt-6 space-y-3">
        {reservations.map((r) => (
          <li
            key={r.id}
            className="p-5 border border-line-bright bg-bg-card rounded-xl flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display font-semibold text-cream">
                  {r.branch?.name ?? "—"}
                </span>
                <span className="font-mono text-[0.7rem] text-amber">{r.station_label}</span>
                <StatusChip status={r.status} />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-cream-dim font-mono">
                <Calendar className="h-3 w-3" />
                {formatDateTime(r.requested_start)} → {formatDateTime(r.requested_end)}
              </div>
              {r.actual_start && (
                <div className="mt-1 font-mono text-[0.7rem] text-phosphor">
                  // started {formatDateTime(r.actual_start)}
                  {r.actual_end && ` · ended ${formatDateTime(r.actual_end)}`}
                </div>
              )}
              {r.notes && (
                <p className="mt-2 text-xs text-cream-dim">{r.notes}</p>
              )}
            </div>
            {(r.status === "requested" || r.status === "confirmed") && (
              <form action={cancelMyReservationAction}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  className="text-red-400 hover:text-red-300 p-2"
                  aria-label="Cancel"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            )}
          </li>
        ))}
        {reservations.length === 0 && (
          <li className="p-10 border border-dashed border-line-bright rounded-xl text-center">
            <Cpu className="mx-auto h-8 w-8 text-mocha" />
            <p className="mt-4 font-mono text-xs uppercase tracking-widest text-mocha">
              // no reservations yet
            </p>
            <Link href="/account/reservations/new" className="mt-6 inline-flex key-cap">
              Request your first station
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    requested: "text-amber border-amber/40",
    confirmed: "text-rgb-b border-[color:var(--color-rgb-b)]/40",
    active: "text-phosphor border-phosphor/40",
    completed: "text-cream-dim border-line-bright",
    cancelled: "text-mocha border-line",
  };
  return (
    <span
      className={`inline-block font-mono text-[0.65rem] uppercase tracking-widest px-2 py-1 border rounded ${map[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
