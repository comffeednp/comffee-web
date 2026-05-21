import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createPromoCodeAction } from "../../_actions/promo-codes";
import PromoCodeFields from "@/components/admin/PromoCodeFields";
import { ArrowLeft, Save } from "lucide-react";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewPromoCodePage({ searchParams }: Props) {
  await requireAdmin();
  const { error } = await searchParams;
  return (
    <section className="container-edge py-12 max-w-3xl">
      <Link
        href="/admin/promo-codes"
        title="Back to all promo codes"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        <ArrowLeft className="h-3 w-3" />
        All promo codes
      </Link>

      <div className="mt-6">
        <p className="terminal-label">/promo-codes/new</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
          New promo code
        </h1>
      </div>

      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      <form action={createPromoCodeAction} className="mt-10 space-y-8">
        <PromoCodeFields />
        <button type="submit" title="Create this promo code" className="key-cap key-cap-primary">
          <Save className="h-4 w-4" />
          Create
        </button>
      </form>
    </section>
  );
}
