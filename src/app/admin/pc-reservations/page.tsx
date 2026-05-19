import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ArrowRight, Cpu } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PCReservationRow {
  id: string;
  station_name: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  reserved_for_start: string;
  reserved_for_end: string;
  duration_minutes: number;
  status: string;
  created_at: string;
  branch: { name: string } | null;
}

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminPCReservationsPage({ searchParams }: Props) {
  await requireAdmin();
  const { status } = await searchParams;
  const supabase = await getSupabaseServer();

  let q = supabase
    .from("pc_reservations")
    .select("*, branch:branches(name)")
    .order("reserved_for_start", { ascending: true })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  const reservations = (data ?? []) as unknown as PCReservationRow[];

  return (
    <section className="container-edge py-12">
      <div className="flex items-end justify-between gap-6 mb-10">
        <div>
          <p className="terminal-label">/pc-reservations</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
            PC reservations
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Customer-created station reservations from the live PC view. Honor them when the customer arrives.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {[
          { label: "All", value: "" },
          { label: "Pending", value: "pending" },
          { label: "Acknowledged", value: "acknowledged" },
          { label: "Honored", value: "honored" },
          { label: "Cancelled", value: "cancelled" },
          { label: "Expired", value: "expired" },
        ].map((f) => (
          <FilterChip
            key={f.value}
            href={`/admin/pc-reservations${f.value ? `?status=${f.value}` : ""}`}
            active={status === f.value || (!status && f.value === "")}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      <div className="border border-line-bright rounded-xl overflow-hidden bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-left">
              {["Customer", "Branch", "Station", "Arrive", "Duration", "Status", ""].map((h) => (
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
                  <div className="text-cream">{r.customer_name}</div>
                  {r.customer_phone && (
                    <div className="text-[0.7rem] text-mocha mt-0.5">{r.customer_phone}</div>
                  )}
                </td>
                <td className="px-5 py-4 text-cream-dim">{r.branch?.name ?? "—"}</td>
                <td className="px-5 py-4">
                  <span className="font-mono text-amber font-bold">{r.station_name ?? "—"}</span>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-cream-dim">
                  {formatDateTime(r.reserved_for_start)}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-cream-dim">
                  {r.duration_minutes}m
                </td>
                <td className="px-5 py-4">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/pc-reservations/${r.id}`}
                    className="font-mono text-xs uppercase tracking-widest text-amber hover:underline inline-flex items-center gap-1"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {reservations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-cream-dim font-mono">
                  <Cpu className="mx-auto h-8 w-8 text-mocha mb-3" />
                  // no reservations match these filters
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
    pending: "text-amber border-amber/40",
    acknowledged: "text-rgb-b border-[color:var(--color-rgb-b)]/40",
    honored: "text-phosphor border-phosphor/40",
    cancelled: "text-mocha border-line",
    expired: "text-red-400 border-red-700/50",
  };
  return (
    <span
      className={`inline-block font-mono text-[0.65rem] uppercase tracking-widest px-2 py-1 border rounded ${map[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
