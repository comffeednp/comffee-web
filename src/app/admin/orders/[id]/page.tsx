import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getOrderById } from "@/lib/orders";
import {
  setOrderStatusAction,
  manualMarkPaidAction,
  deleteOrderAction,
} from "../../_actions/orders";
import { getSupabaseServer } from "@/lib/supabase/server";
import RefundButton from "@/components/admin/RefundButton";
import { ArrowLeft, Trash2 } from "lucide-react";
import { formatDateTime, formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}

interface OrderItemRow {
  id: string;
  name_snapshot: string;
  price_snapshot: number;
  qty: number;
  line_total: number;
}

export default async function AdminOrderDetailPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { ok } = await searchParams;
  const order = await getOrderById(id);
  if (!order) notFound();

  const branch = (order as { branch?: { name: string } | null }).branch;
  const items = (order.items ?? []) as OrderItemRow[];

  // Sum of succeeded refunds for this order
  const supabase = await getSupabaseServer();
  const { data: refundRows } = await supabase
    .from("refunds")
    .select("amount_php, status, reason, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false });
  const refunds = refundRows ?? [];
  const alreadyRefunded = refunds
    .filter((r) => r.status === "succeeded")
    .reduce((s, r) => s + Number(r.amount_php), 0);

  const statusFlow: Array<{ value: string; label: string }> = [
    { value: "placed", label: "Placed" },
    { value: "preparing", label: "Preparing" },
    { value: "ready", label: "Ready" },
    { value: "served", label: "Served" },
    { value: "cancelled", label: "Cancel" },
  ];

  return (
    <section className="container-edge py-12 max-w-3xl">
      <Link
        href="/admin/orders"
        title="Back to all orders"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        All orders
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/orders/{order.id.slice(0, 8)}</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          {order.customer_name}
        </h1>
        <p className="mt-1 font-mono text-xs text-mocha">
          {order.customer_phone ?? "no phone"} · {order.customer_email ?? "no email"}
        </p>
      </div>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// {ok}</p>}

      {/* facts */}
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Field label="branch" value={branch?.name ?? "—"} />
        <Field label="status" value={order.status} mono />
        <Field label="payment" value={order.payment_status} mono />
        <Field
          label="ready by"
          value={order.scheduled_for ? formatDateTime(order.scheduled_for) : "ASAP"}
        />
        <Field label="created" value={formatDateTime(order.created_at)} />
        <Field label="total" value={formatPHP(Number(order.total_php))} highlight />
      </div>

      {order.notes && (
        <div className="mt-6 p-4 border border-line rounded-md bg-bg">
          <p className="terminal-label">// notes</p>
          <p className="mt-2 text-cream-dim text-sm whitespace-pre-line">{order.notes}</p>
        </div>
      )}

      {/* items */}
      <div className="mt-10 border border-line-bright rounded-xl overflow-hidden bg-bg-card">
        <div className="bg-bg-soft px-5 py-3 border-b border-line">
          <p className="terminal-label">// line_items</p>
        </div>
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <li
              key={it.id}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-cream">× {it.qty} {it.name_snapshot}</p>
                <p className="font-mono text-[0.7rem] text-mocha mt-0.5">
                  @ {formatPHP(Number(it.price_snapshot))}
                </p>
              </div>
              <span className="font-mono text-amber font-semibold">
                {formatPHP(Number(it.line_total))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* status actions */}
      <div className="mt-10">
        <p className="terminal-label">// transition</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {statusFlow.map((s) => (
            <form key={s.value} action={setOrderStatusAction}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="status" value={s.value} />
              <button
                type="submit"
                disabled={order.status === s.value}
                title={`Set status to ${s.label}`}
                className={`font-mono text-[0.7rem] uppercase tracking-widest px-3 py-2 rounded-md border transition ${
                  order.status === s.value
                    ? "bg-amber text-bg border-amber cursor-default"
                    : s.value === "cancelled"
                    ? "border-red-700 text-red-400 hover:bg-red-950/40"
                    : "border-line-bright text-cream-dim hover:text-amber hover:border-amber/60"
                }`}
              >
                → {s.label}
              </button>
            </form>
          ))}
        </div>
      </div>

      {/* REFUNDS */}
      {(order.payment_status === "paid" || refunds.length > 0) && (
        <div className="mt-10 p-6 border border-line-bright rounded-xl bg-bg-card">
          <p className="terminal-label">// refunds</p>
          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-cream-dim">
                Paid {formatPHP(Number(order.total_php))}
                {alreadyRefunded > 0 && (
                  <> · refunded {formatPHP(alreadyRefunded)}</>
                )}
              </p>
            </div>
            <RefundButton
              orderId={order.id}
              totalPhp={Number(order.total_php)}
              alreadyRefunded={alreadyRefunded}
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

      {/* payment + danger */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        {order.payment_status !== "paid" && (
          <form action={manualMarkPaidAction}>
            <input type="hidden" name="id" value={order.id} />
            <button type="submit" title="Manually mark this order as paid" className="key-cap key-cap-phosphor">
              Mark as paid (manual)
            </button>
          </form>
        )}
        <form action={deleteOrderAction}>
          <input type="hidden" name="id" value={order.id} />
          <button
            type="submit"
            title="Permanently delete this order"
            className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </form>
      </div>
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
