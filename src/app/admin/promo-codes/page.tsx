import Link from "next/link";
import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ArrowRight, Plus } from "lucide-react";
import { formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PromoRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  applies_to: string;
  used_count: number;
  max_uses: number | null;
  is_active: boolean;
  valid_until: string | null;
}

interface Props {
  searchParams: Promise<{ deleted?: string }>;
}

export default async function PromoCodesPage({ searchParams }: Props) {
  await requireFullAdmin();
  const { deleted } = await searchParams;
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });
  const codes = (data ?? []) as PromoRow[];

  return (
    <section className="container-edge py-12">
      <div className="flex items-end justify-between gap-6 mb-10">
        <div>
          <p className="terminal-label">/promo-codes</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
            Promo codes
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Discount codes for orders and Playcation bookings. Customers enter them at checkout.
          </p>
        </div>
        <Link href="/admin/promo-codes/new" className="key-cap key-cap-primary">
          <Plus className="h-4 w-4" />
          New code
        </Link>
      </div>

      {deleted && <p className="font-mono text-xs text-phosphor mb-4">// deleted</p>}

      <div className="border border-line-bright rounded-xl overflow-hidden bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-left">
              {["Code", "Discount", "Applies to", "Used", "Active", ""].map((h) => (
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
            {codes.map((c) => (
              <tr key={c.id} className="border-t border-line hover:bg-bg-elev/40">
                <td className="px-5 py-4">
                  <div className="font-mono font-bold text-amber">{c.code}</div>
                  {c.description && (
                    <div className="text-[0.7rem] text-mocha mt-0.5">{c.description}</div>
                  )}
                </td>
                <td className="px-5 py-4 font-mono text-cream">
                  {c.discount_type === "percent"
                    ? `${c.discount_value}%`
                    : formatPHP(c.discount_value)}
                </td>
                <td className="px-5 py-4 font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim">
                  {c.applies_to}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-cream-dim">
                  {c.used_count}
                  {c.max_uses ? ` / ${c.max_uses}` : ""}
                </td>
                <td className="px-5 py-4">
                  {c.is_active ? (
                    <span className="status-chip">live</span>
                  ) : (
                    <span className="font-mono text-[0.65rem] uppercase text-mocha">off</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/promo-codes/${c.id}`}
                    className="font-mono text-xs uppercase tracking-widest text-amber hover:underline inline-flex items-center gap-1"
                  >
                    Edit <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-cream-dim font-mono">
                  // no promo codes yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
