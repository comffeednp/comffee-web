import Link from "next/link";
import { getAdminScope } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { manualBlockAction, approveBookingAction, rejectBookingAction } from "../_actions/bookings";
import ExportButton from "@/components/admin/ExportButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { ArrowRight, Plus, Check, X } from "lucide-react";
import { formatDate, formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Reservation {
  id: string;
  branch_id: string;
  source: "website" | "airbnb" | "manual_block";
  status: "pending_hold" | "pending_approval" | "confirmed" | "cancelled" | "completed";
  check_in: string;
  check_out: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  total_php: number | null;
  paymongo_intent_id: string | null;
  hold_expires_at: string | null;
  created_at: string;
}

interface Props {
  searchParams: Promise<{ status?: string; error?: string }>;
}

export default async function AdminBookingsPage({ searchParams }: Props) {
  const { branchId } = await getAdminScope();
  const { status, error } = await searchParams;
  const supabase = await getSupabaseServer();

  let q = supabase
    .from("reservations")
    .select("*, branch:branches(id, slug, name, type)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "active") q = q.in("status", ["pending_hold", "pending_approval", "confirmed"]);
  else if (status === "pending") q = q.eq("status", "pending_approval");
  else if (status === "cancelled") q = q.eq("status", "cancelled");
  if (branchId) q = q.eq("branch_id", branchId) as typeof q; // branch-partner scope
  const { data } = await q;
  const reservations = (data ?? []) as Array<
    Reservation & { branch: { slug: string; name: string; type: string } | null }
  >;

  // Count of requests waiting for the owner's decision — drives the banner + chip
  let pendingQ = supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_approval");
  if (branchId) pendingQ = pendingQ.eq("branch_id", branchId) as typeof pendingQ;
  const { count: pendingCountRaw } = await pendingQ;
  const pendingCount = pendingCountRaw ?? 0;

  // Branches for the manual-block form
  const { data: branchesData } = await supabase
    .from("branches")
    .select("id, name, type")
    .eq("type", "playcation")
    .order("sort_order");
  const branches = branchesData ?? [];

  return (
    <section className="container-edge py-12">
      <div className="flex items-end justify-between gap-6 mb-10">
        <div>
          <p className="terminal-label">/bookings</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
            Bookings
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Playcation reservations from the website + Airbnb. Confirmed via PayMongo or manually.
          </p>
        </div>
        <ExportButton entity="bookings" />
      </div>

      {error && <p className="font-mono text-xs text-red-400 mb-4">// {error}</p>}

      {pendingCount > 0 && (
        <div className="mb-6 flex items-center gap-3 p-4 border border-amber/50 bg-amber/5 rounded-xl flex-wrap">
          <span className="font-mono text-xs text-amber uppercase tracking-widest">// awaiting approval</span>
          <span className="text-sm text-cream-dim">
            {pendingCount} booking request{pendingCount === 1 ? "" : "s"} waiting for your decision.
          </span>
          <Link
            href="/admin/bookings?status=pending"
            title="Review the bookings waiting for your decision"
            className="ml-auto font-mono text-xs uppercase tracking-widest text-amber hover:underline"
          >
            Review →
          </Link>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-6">
        <FilterChip href="/admin/bookings" active={!status}>
          All
        </FilterChip>
        <FilterChip href="/admin/bookings?status=active" active={status === "active"}>
          Active
        </FilterChip>
        <FilterChip href="/admin/bookings?status=pending" active={status === "pending"}>
          Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </FilterChip>
        <FilterChip href="/admin/bookings?status=cancelled" active={status === "cancelled"}>
          Cancelled
        </FilterChip>
      </div>

      <div className="border border-line-bright rounded-xl overflow-hidden bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-left">
              {["Guest", "Branch", "Dates", "Source", "Status", "Total", ""].map((h) => (
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
              <tr
                key={r.id}
                className={`border-t border-line hover:bg-bg-elev/40 ${
                  r.status === "pending_approval" ? "bg-amber/[0.04]" : ""
                }`}
              >
                <td className="px-5 py-4">
                  <div className="text-cream">{r.guest_name ?? "—"}</div>
                  {r.guest_email && (
                    <div className="text-[0.7rem] text-mocha mt-0.5 truncate max-w-[160px]">
                      {r.guest_email}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4 text-cream-dim">{r.branch?.name ?? "—"}</td>
                <td className="px-5 py-4 font-mono text-xs text-cream-dim">
                  {formatDate(r.check_in)} → {formatDate(r.check_out)}
                </td>
                <td className="px-5 py-4">
                  <SourceChip source={r.source} />
                </td>
                <td className="px-5 py-4">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-5 py-4 font-mono text-amber font-semibold">
                  {formatPHP(r.total_php ?? 0)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {r.status === "pending_approval" && (
                      <>
                        <ConfirmSubmitButton
                          action={approveBookingAction}
                          id={r.id}
                          confirmText={`Accept ${r.guest_name ?? "this guest"}'s booking? They'll be confirmed and emailed.`}
                          title="Accept and confirm this booking"
                          className="inline-flex items-center gap-1 border border-phosphor/50 rounded-md px-2.5 py-1.5 text-[0.65rem] font-mono uppercase tracking-widest text-phosphor hover:bg-phosphor/10"
                        >
                          <Check className="h-3 w-3" /> Accept
                        </ConfirmSubmitButton>
                        <ConfirmSubmitButton
                          action={rejectBookingAction}
                          id={r.id}
                          reason="Booking request declined by host"
                          confirmText={`Decline ${r.guest_name ?? "this guest"}'s booking? They'll be refunded in full and the dates reopened.`}
                          title="Decline this booking and refund the guest"
                          className="inline-flex items-center gap-1 border border-red-700 rounded-md px-2.5 py-1.5 text-[0.65rem] font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
                        >
                          <X className="h-3 w-3" /> Reject
                        </ConfirmSubmitButton>
                      </>
                    )}
                    <Link
                      href={`/admin/bookings/${r.id}`}
                      title="View this booking's full details"
                      className="font-mono text-xs uppercase tracking-widest text-amber hover:underline inline-flex items-center gap-1"
                    >
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {reservations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-cream-dim font-mono">
                  // no bookings yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Manual block form */}
      <div className="mt-12 p-6 border border-line-bright rounded-xl bg-bg-card">
        <p className="terminal-label">// add_manual_block</p>
        <p className="mt-2 text-sm text-cream-dim">
          Reserve dates manually without payment — for owner stays, maintenance, etc.
        </p>
        <form action={manualBlockAction} className="mt-5 grid gap-3 md:grid-cols-[2fr_1fr_1fr_2fr_auto]">
          <select name="branch_id" required className="admin-input">
            <option value="">— Branch *</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input type="date" name="check_in" required className="admin-input" />
          <input type="date" name="check_out" required className="admin-input" />
          <input name="notes" placeholder="Reason / notes" className="admin-input" />
          <button type="submit" title="Block these dates for the selected branch" className="key-cap !py-2 !px-3">
            <Plus className="h-4 w-4" />
            Block
          </button>
        </form>
      </div>

      <style>{`
        .admin-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-size: 0.9rem;
          color-scheme: dark;
        }
      `}</style>
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

function SourceChip({ source }: { source: string }) {
  const map: Record<string, string> = {
    website: "text-phosphor border-phosphor/40",
    airbnb: "text-amber border-amber/40",
    manual_block: "text-cream-dim border-line-bright",
  };
  return (
    <span
      className={`inline-block font-mono text-[0.65rem] uppercase tracking-widest px-2 py-1 border rounded ${map[source] ?? ""}`}
    >
      {source}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_hold: "text-amber border-amber/40",
    pending_approval: "text-amber border-amber bg-amber/10",
    confirmed: "text-phosphor border-phosphor/40",
    cancelled: "text-mocha border-line",
    completed: "text-cream-dim border-line-bright",
  };
  return (
    <span
      className={`inline-block font-mono text-[0.65rem] uppercase tracking-widest px-2 py-1 border rounded ${map[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
