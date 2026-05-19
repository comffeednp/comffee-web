import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatPHP, formatDateTime } from "@/lib/utils";
import ConfirmedAnimation from "@/components/booking/ConfirmedAnimation";
import { CreditCard, User, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top-up received",
};

interface TopupRow {
  id: string;
  branch_id: string;
  member_number: string;
  customer_name: string | null;
  amount_php: number;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
  branch: { name: string } | { name: string }[] | null;
}

export default async function TopupConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("member_topups")
    .select("*, branch:branches(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const topup = data as unknown as TopupRow;
  const branchName = Array.isArray(topup.branch)
    ? topup.branch[0]?.name ?? "Comffee"
    : topup.branch?.name ?? "Comffee";
  const isPaid = topup.payment_status === "paid";
  const isFulfilled = topup.fulfillment_status === "completed";

  return (
    <section className="relative min-h-[80vh] py-20 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="container-edge relative">
        <div className="max-w-2xl mx-auto text-center">
          <ConfirmedAnimation />

          <p className="mt-10 terminal-label">// transmission_received</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl font-bold leading-[0.85] tracking-tight text-cream">
            {isFulfilled ? (
              <>
                TOPPED<br />
                <span className="text-phosphor text-glow-phosphor">UP.</span>
              </>
            ) : isPaid ? (
              <>
                PAYMENT<br />
                <span className="text-amber text-glow-amber">RECEIVED.</span>
              </>
            ) : (
              <>
                TOP-UP<br />
                <span className="text-amber text-glow-amber">PENDING.</span>
              </>
            )}
          </h1>
          <p className="mt-6 text-lg text-cream-dim max-w-lg mx-auto">
            {isFulfilled
              ? "Your member account has been credited. Log in at the cafe and play."
              : isPaid
              ? "We received your payment. The cashier will credit your member account within a few minutes."
              : "We're waiting for payment confirmation. This page will update."}
          </p>

          {/* Receipt monitor */}
          <div className="mt-12 monitor-frame text-left">
            <div className="monitor-screen p-6 md:p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="font-mono text-phosphor uppercase tracking-widest text-[0.65rem]">
                  // topup_id
                </span>
                <span className="font-mono text-cream-dim text-[0.7rem] truncate ml-2">
                  {topup.id}
                </span>
              </div>

              <div className="space-y-2 font-mono text-sm">
                <Row icon={Wallet} label="branch" value={branchName} />
                <Row icon={User} label="member #" value={topup.member_number} />
                <Row icon={User} label="customer" value={topup.customer_name ?? "—"} />
                <Row icon={CreditCard} label="created" value={formatDateTime(topup.created_at)} />
              </div>

              <div className="pt-4 border-t border-line flex items-baseline justify-between">
                <span className="font-mono text-mocha uppercase tracking-widest text-[0.65rem]">
                  // amount
                </span>
                <span className="text-3xl md:text-4xl font-display font-bold text-amber text-glow-amber">
                  {formatPHP(Number(topup.amount_php))}
                </span>
              </div>

              <div className="pt-4 border-t border-line space-y-2">
                <StatusRow
                  label="payment"
                  value={topup.payment_status}
                  good={isPaid}
                />
                <StatusRow
                  label="fulfillment"
                  value={topup.fulfillment_status}
                  good={isFulfilled}
                />
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link href="/" className="key-cap">
              Back home
            </Link>
            <Link href="/topup" className="key-cap">
              Another top-up
            </Link>
          </div>

          <p className="mt-8 font-mono text-[0.65rem] text-mocha uppercase tracking-widest">
            // save this page or bookmark it to check status
          </p>
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

function StatusRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
        // {label}
      </span>
      <span
        className={`font-mono text-sm font-bold ${
          good ? "text-phosphor text-glow-phosphor" : "text-amber"
        }`}
      >
        {good ? "▶" : "◔"} {value.toUpperCase()}
      </span>
    </div>
  );
}
