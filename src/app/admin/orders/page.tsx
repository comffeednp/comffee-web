import Link from "next/link";
import { getAdminScope } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ArrowRight } from "lucide-react";
import { formatDateTime, formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ status?: string; payment?: string; ok?: string }>;
}

interface OrderRow {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  total_php: number;
  status: string;
  payment_status: string;
  scheduled_for: string | null;
  created_at: string;
  branch: { name: string } | null;
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const { branchId } = await getAdminScope();
  const { status, payment, ok } = await searchParams;
  const supabase = await getSupabaseServer();

  let q = supabase
    .from("orders")
    .select("*, branch:branches(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  if (payment) q = q.eq("payment_status", payment);
  if (branchId) q = q.eq("branch_id", branchId) as typeof q; // branch-partner scope
  const { data } = await q;
  const orders = (data ?? []) as unknown as OrderRow[];

  return (
    <section className="container-edge py-12">
      <div className="flex items-end justify-between gap-6 mb-10">
        <div>
          <p className="terminal-label">/orders</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
            Orders
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Advance orders placed online. Mark them through the prep cycle as you work them.
          </p>
        </div>
      </div>

      {ok && <p className="font-mono text-xs text-phosphor mb-4">// {ok}</p>}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <FilterChip href="/admin/orders" active={!status && !payment}>
          All
        </FilterChip>
        <FilterChip href="/admin/orders?status=placed" active={status === "placed"}>
          Placed
        </FilterChip>
        <FilterChip href="/admin/orders?status=preparing" active={status === "preparing"}>
          Preparing
        </FilterChip>
        <FilterChip href="/admin/orders?status=ready" active={status === "ready"}>
          Ready
        </FilterChip>
        <FilterChip href="/admin/orders?status=served" active={status === "served"}>
          Served
        </FilterChip>
        <FilterChip href="/admin/orders?payment=paid" active={payment === "paid"}>
          Paid
        </FilterChip>
        <FilterChip href="/admin/orders?payment=unpaid" active={payment === "unpaid"}>
          Unpaid
        </FilterChip>
      </div>

      <div className="border border-line-bright rounded-xl overflow-hidden bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-left">
              {["Customer", "Branch", "Status", "Payment", "Ready by", "Total", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="px-5 py-3 font-mono text-[0.65rem] uppercase tracking-widest text-mocha"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-line hover:bg-bg-elev/40">
                <td className="px-5 py-4">
                  <div className="text-cream">{o.customer_name}</div>
                  {o.customer_phone && (
                    <div className="text-[0.7rem] text-mocha mt-0.5">{o.customer_phone}</div>
                  )}
                </td>
                <td className="px-5 py-4 text-cream-dim">{o.branch?.name ?? "—"}</td>
                <td className="px-5 py-4">
                  <StatusChip status={o.status} />
                </td>
                <td className="px-5 py-4">
                  <PaymentChip status={o.payment_status} />
                </td>
                <td className="px-5 py-4 font-mono text-xs text-cream-dim">
                  {o.scheduled_for ? formatDateTime(o.scheduled_for) : "ASAP"}
                </td>
                <td className="px-5 py-4 font-mono text-amber font-semibold">
                  {formatPHP(o.total_php)}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-mono text-xs uppercase tracking-widest text-amber hover:underline inline-flex items-center gap-1"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-cream-dim font-mono">
                  // no orders yet
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
    placed: "text-amber border-amber/40",
    preparing: "text-rgb-b border-[color:var(--color-rgb-b)]/40",
    ready: "text-phosphor border-phosphor/40",
    served: "text-cream-dim border-line-bright",
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

function PaymentChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "text-phosphor border-phosphor/40",
    pending: "text-amber border-amber/40",
    unpaid: "text-mocha border-line",
    failed: "text-red-400 border-red-700/50",
    refunded: "text-cream-dim border-line-bright",
  };
  return (
    <span
      className={`inline-block font-mono text-[0.65rem] uppercase tracking-widest px-2 py-1 border rounded ${map[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
