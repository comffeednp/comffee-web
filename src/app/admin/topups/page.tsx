import { requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fulfillTopupAction, cancelTopupAction } from "../_actions/topups";
import { Check, Wallet, X } from "lucide-react";
import { formatDateTime, formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface TopupRow {
  id: string;
  branch_id: string;
  member_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  amount_php: number;
  payment_status: string;
  fulfillment_status: string;
  paymongo_payment_id: string | null;
  created_at: string;
  fulfilled_at: string | null;
  branch: { name: string } | { name: string }[] | null;
}

interface Props {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}

export default async function AdminTopupsPage({ searchParams }: Props) {
  await requireAdmin();
  const { status, ok, error } = await searchParams;
  const supabase = await getSupabaseServer();

  let q = supabase
    .from("member_topups")
    .select("*, branch:branches(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  // Default view: pending fulfillment of paid topups (the cashier's to-do list)
  if (!status) {
    q = q.eq("payment_status", "paid").eq("fulfillment_status", "pending");
  } else if (status === "all") {
    // no filter
  } else if (status === "completed") {
    q = q.eq("fulfillment_status", "completed");
  } else if (status === "cancelled") {
    q = q.eq("fulfillment_status", "cancelled");
  } else if (status === "unpaid") {
    q = q.eq("payment_status", "unpaid");
  } else if (status === "pending") {
    q = q.eq("payment_status", "pending");
  }

  const { data } = await q;
  const topups = (data ?? []) as unknown as TopupRow[];

  return (
    <section className="container-edge py-12">
      <div className="mb-10">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-amber" />
          <p className="terminal-label">/topups</p>
        </div>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          Member top-ups
        </h1>
        <p className="mt-2 text-sm text-cream-dim">
          Paid top-ups waiting for you to credit the member balance in PanCafe. Mark fulfilled once you&apos;ve applied the credit.
        </p>
      </div>

      {ok && <p className="font-mono text-xs text-phosphor mb-4">// {ok}</p>}
      {error && <p className="font-mono text-xs text-red-400 mb-4">// {error}</p>}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <FilterChip href="/admin/topups" active={!status}>
          To fulfill
        </FilterChip>
        <FilterChip href="/admin/topups?status=completed" active={status === "completed"}>
          Completed
        </FilterChip>
        <FilterChip href="/admin/topups?status=cancelled" active={status === "cancelled"}>
          Cancelled
        </FilterChip>
        <FilterChip href="/admin/topups?status=pending" active={status === "pending"}>
          Payment pending
        </FilterChip>
        <FilterChip href="/admin/topups?status=unpaid" active={status === "unpaid"}>
          Unpaid
        </FilterChip>
        <FilterChip href="/admin/topups?status=all" active={status === "all"}>
          All
        </FilterChip>
      </div>

      <ul className="space-y-3">
        {topups.map((t) => {
          const branchName = Array.isArray(t.branch)
            ? t.branch[0]?.name ?? "—"
            : t.branch?.name ?? "—";
          const isActionable =
            t.payment_status === "paid" && t.fulfillment_status === "pending";
          return (
            <li
              key={t.id}
              className={`p-5 rounded-xl border ${
                isActionable
                  ? "border-amber/40 bg-amber/5 glow-amber"
                  : "border-line-bright bg-bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-display text-xl font-bold text-cream">
                      {formatPHP(Number(t.amount_php))}
                    </span>
                    <span className="font-mono text-sm text-amber">
                      #{t.member_number}
                    </span>
                    <PaymentChip status={t.payment_status} />
                    <FulfillmentChip status={t.fulfillment_status} />
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-cream-dim flex-wrap">
                    {t.customer_name && <span>{t.customer_name}</span>}
                    {t.customer_phone && <span>· {t.customer_phone}</span>}
                    {t.customer_email && <span>· {t.customer_email}</span>}
                    <span>· {branchName}</span>
                    <span>· {formatDateTime(t.created_at)}</span>
                  </div>
                  {t.paymongo_payment_id && (
                    <p className="mt-1 font-mono text-[0.65rem] text-mocha break-all">
                      // pay ref: {t.paymongo_payment_id}
                    </p>
                  )}
                </div>
                {isActionable && (
                  <div className="flex items-center gap-2 shrink-0">
                    <form action={fulfillTopupAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 border border-phosphor/50 rounded-md px-3 py-1.5 text-[0.7rem] font-mono uppercase tracking-widest text-phosphor hover:bg-phosphor/10"
                      >
                        <Check className="h-3 w-3" />
                        Credited in PanCafe
                      </button>
                    </form>
                    <form action={cancelTopupAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="text-red-400 hover:text-red-300 p-2"
                        aria-label="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {topups.length === 0 && (
          <li className="p-12 border border-dashed border-line-bright rounded-xl text-center">
            <Wallet className="mx-auto h-8 w-8 text-mocha" />
            <p className="mt-4 font-mono text-xs uppercase tracking-widest text-mocha">
              // no top-ups match these filters
            </p>
          </li>
        )}
      </ul>
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
      className={`inline-block font-mono text-[0.6rem] uppercase tracking-widest px-2 py-1 border rounded ${map[status] ?? ""}`}
    >
      pay · {status}
    </span>
  );
}

function FulfillmentChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "text-amber border-amber/40",
    completed: "text-phosphor border-phosphor/40",
    cancelled: "text-mocha border-line",
  };
  return (
    <span
      className={`inline-block font-mono text-[0.6rem] uppercase tracking-widest px-2 py-1 border rounded ${map[status] ?? ""}`}
    >
      fulfil · {status}
    </span>
  );
}
