import { notFound } from "next/navigation";
import Link from "next/link";
import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  updatePromoCodeAction,
  deletePromoCodeAction,
} from "../../_actions/promo-codes";
import PromoCodeFields from "@/components/admin/PromoCodeFields";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { formatDateTime, formatPHP } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}

interface RedemptionRow {
  id: string;
  redeemed_at: string;
  discount_php: number;
  order_id: string | null;
  reservation_id: string | null;
}

export default async function EditPromoCodePage({ params, searchParams }: Props) {
  await requireFullAdmin();
  const { id } = await params;
  const { ok, error } = await searchParams;
  const supabase = await getSupabaseServer();

  const [promoRes, redemptionsRes] = await Promise.all([
    supabase.from("promo_codes").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("promo_code_redemptions")
      .select("*")
      .eq("promo_code_id", id)
      .order("redeemed_at", { ascending: false })
      .limit(100),
  ]);

  if (!promoRes.data) notFound();
  const promo = promoRes.data;
  const redemptions = (redemptionsRes.data ?? []) as RedemptionRow[];

  return (
    <section className="container-edge py-12 max-w-3xl">
      <Link
        href="/admin/promo-codes"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        All promo codes
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/promo-codes/{promo.code}</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          Edit code
        </h1>
      </div>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// saved</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      <form action={updatePromoCodeAction} className="mt-10 space-y-8">
        <PromoCodeFields promo={promo} />
        <button type="submit" title="Save promo code changes" className="key-cap key-cap-primary">
          <Save className="h-4 w-4" />
          Save changes
        </button>
      </form>

      {/* REDEMPTIONS HISTORY */}
      <div className="mt-16 pt-10 border-t border-line">
        <p className="terminal-label">// redemptions ({redemptions.length})</p>
        <ul className="mt-4 space-y-2">
          {redemptions.map((r) => (
            <li
              key={r.id}
              className="p-3 border border-line rounded-md bg-bg flex items-center justify-between text-sm"
            >
              <span className="font-mono text-cream-dim">
                {formatDateTime(r.redeemed_at)} ·{" "}
                {r.order_id ? `order ${r.order_id.slice(0, 8)}` : null}
                {r.reservation_id
                  ? `reservation ${r.reservation_id.slice(0, 8)}`
                  : null}
              </span>
              <span className="font-mono text-amber font-semibold">
                -{formatPHP(Number(r.discount_php))}
              </span>
            </li>
          ))}
          {redemptions.length === 0 && (
            <li className="font-mono text-xs text-mocha">// no redemptions yet</li>
          )}
        </ul>
      </div>

      {/* DANGER */}
      <div className="mt-12 p-6 border border-red-900/50 rounded-xl bg-red-950/10">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-red-400">// danger</p>
        <p className="mt-3 text-sm text-cream-dim">
          Deleting this code also removes its redemption history.
        </p>
        <form action={deletePromoCodeAction} className="mt-4">
          <input type="hidden" name="id" value={promo.id} />
          <button
            type="submit"
            title="Permanently delete this promo code"
            className="inline-flex items-center gap-2 border border-red-700 rounded-md px-4 py-2 text-xs font-mono uppercase tracking-widest text-red-400 hover:bg-red-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete code
          </button>
        </form>
      </div>
    </section>
  );
}
