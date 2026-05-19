import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getOrderById } from "@/lib/orders";
import { formatDateTime, formatPHP } from "@/lib/utils";
import ConfirmedAnimation from "@/components/booking/ConfirmedAnimation";
import { Coffee, Clock, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order placed",
};

interface OrderItem {
  id: string;
  name_snapshot: string;
  price_snapshot: number;
  qty: number;
  line_total: number;
}

export default async function OrderConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();
  const branch = (order as { branch?: { name: string; slug: string } | null }).branch;
  const items = (order.items ?? []) as OrderItem[];
  const isPaid = order.payment_status === "paid";

  return (
    <section className="relative min-h-[80vh] py-20 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="container-edge relative">
        <div className="max-w-3xl mx-auto text-center">
          <ConfirmedAnimation />

          <p className="mt-10 terminal-label">// order_received</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.85] tracking-tight text-cream">
            ORDER<br />
            <span className="text-amber text-glow-amber">PLACED.</span>
          </h1>
          <p className="mt-6 text-lg text-cream-dim max-w-xl mx-auto">
            {isPaid
              ? "We're firing up the espresso machine. Show this screen at pickup."
              : "Your order is queued. We'll start prep the moment payment confirms."}
          </p>

          {/* Receipt monitor */}
          <div className="mt-12 monitor-frame text-left">
            <div className="monitor-screen p-6 md:p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="font-mono text-phosphor uppercase tracking-widest text-[0.65rem]">
                  // order_id
                </span>
                <span className="font-mono text-cream-dim text-[0.7rem] truncate ml-2">
                  {order.id}
                </span>
              </div>

              <div className="space-y-2 font-mono text-sm">
                {branch && (
                  <Row
                    icon={MapPin}
                    label="pickup"
                    value={branch.name}
                  />
                )}
                {order.scheduled_for && (
                  <Row
                    icon={Clock}
                    label="ready by"
                    value={formatDateTime(order.scheduled_for)}
                  />
                )}
                <Row icon={Coffee} label="customer" value={order.customer_name} />
              </div>

              <div className="pt-4 border-t border-line">
                <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha mb-3">
                  // line_items
                </p>
                <ul className="space-y-2">
                  {items.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center justify-between gap-4 font-mono text-sm"
                    >
                      <span className="text-cream truncate">
                        × {it.qty} {it.name_snapshot}
                      </span>
                      <span className="text-cream-dim shrink-0">
                        {formatPHP(Number(it.line_total))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-line flex items-baseline justify-between">
                <span className="font-mono text-mocha uppercase tracking-widest text-[0.65rem]">
                  // total
                </span>
                <span className="text-3xl md:text-4xl font-display font-bold text-amber text-glow-amber">
                  {formatPHP(Number(order.total_php ?? 0))}
                </span>
              </div>

              <div className="pt-4 border-t border-line">
                <p
                  className={`font-mono text-base font-bold ${
                    isPaid ? "text-phosphor text-glow-phosphor" : "text-amber"
                  }`}
                >
                  {isPaid ? "▶ PAID · QUEUED FOR PREP" : "◔ PAYMENT PENDING"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link href="/menu" className="key-cap">
              <Coffee className="h-4 w-4" />
              Order more
            </Link>
            <Link href="/" className="key-cap">
              Back home
            </Link>
          </div>
        </div>
      </div>
    </section>
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
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-mocha uppercase tracking-widest text-[0.65rem]">
        <Icon className="h-3 w-3 text-amber" />
        {label}
      </span>
      <span className="text-cream text-right">{value}</span>
    </div>
  );
}
