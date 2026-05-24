import Link from "next/link";
import { getAdminScope } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ArrowRight } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ReservationRow {
  id: string;
  station_label: string;
  requested_start: string;
  requested_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  member: { full_name: string; member_number: string | null } | null;
  branch: { name: string } | null;
}

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminInternetReservationsPage({ searchParams }: Props) {
  const { branchId } = await getAdminScope();
  const { status } = await searchParams;
  const supabase = await getSupabaseServer();

  let q = supabase
    .from("internet_reservations")
    .select("*, member:members(full_name, member_number), branch:branches(name)")
    .order("requested_start", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  if (branchId) q = q.eq("branch_id", branchId) as typeof q; // branch-partner scope
  const { data } = await q;
  const reservations = (data ?? []) as unknown as ReservationRow[];

  return (
    <section className="container-edge py-12">
      <p className="terminal-label">/internet-reservations</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        Internet cafe reservations
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Member station requests. Confirm them, then start the timer manually when they arrive.
      </p>

      <div className="mt-8 flex items-center gap-2 flex-wrap">
        {[
          { label: "All", value: "" },
          { label: "Requested", value: "requested" },
          { label: "Confirmed", value: "confirmed" },
          { label: "Active", value: "active" },
          { label: "Completed", value: "completed" },
          { label: "Cancelled", value: "cancelled" },
        ].map((f) => (
          <FilterChip
            key={f.value}
            href={`/admin/internet-reservations${f.value ? `?status=${f.value}` : ""}`}
            active={status === f.value || (!status && f.value === "")}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      <div className="mt-8 border border-line-bright rounded-xl overflow-hidden bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-left">
              {["Member", "Branch", "Station", "Requested", "Status", ""].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 font-mono text-[0.65rem] uppercase tracking-widest text-mocha"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-bg-elev/40">
                <td className="px-5 py-4">
                  <div className="text-cream">{r.member?.full_name ?? "—"}</div>
                  <div className="font-mono text-[0.65rem] text-mocha mt-0.5">
                    {r.member?.member_number ?? "—"}
                  </div>
                </td>
                <td className="px-5 py-4 text-cream-dim">{r.branch?.name ?? "—"}</td>
                <td className="px-5 py-4 font-mono text-amber">{r.station_label}</td>
                <td className="px-5 py-4 font-mono text-xs text-cream-dim">
                  {formatDateTime(r.requested_start)}
                  <br />
                  {formatDateTime(r.requested_end)}
                </td>
                <td className="px-5 py-4">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/internet-reservations/${r.id}`}
                    className="font-mono text-xs uppercase tracking-widest text-amber hover:underline inline-flex items-center gap-1"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {reservations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-cream-dim font-mono">
                  // no reservations
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`font-mono text-[0.7rem] uppercase tracking-[0.18em] px-3 py-2 rounded-md border transition ${
        active
          ? "bg-amber text-bg border-amber"
          : "border-line-bright text-cream-dim hover:text-amber hover:border-amber/60"
      }`}
    >
      {children}
    </a>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    requested: "text-amber border-amber/40",
    confirmed: "text-rgb-b border-[color:var(--color-rgb-b)]/40",
    active: "text-phosphor border-phosphor/40 bg-phosphor/5",
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
