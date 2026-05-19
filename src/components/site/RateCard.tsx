import { Users } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import type { BranchRate } from "@/lib/supabase/types";

export default function RateCard({ rate, highlight = false }: { rate: BranchRate; highlight?: boolean }) {
  return (
    <div
      className={`relative p-6 rounded-xl border bg-bg-card transition ${
        highlight
          ? "border-amber/60 glow-amber"
          : "border-line-bright hover:border-amber/40"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-phosphor">
            // {rate.category}
          </p>
          <h3 className="mt-2 text-xl font-display font-semibold text-cream">
            {rate.label}
          </h3>
        </div>
      </div>
      {rate.description && (
        <p className="mt-3 text-sm text-cream-dim leading-relaxed">{rate.description}</p>
      )}
      {rate.max_pax != null && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-cream-dim">
          <Users className="h-3.5 w-3.5 text-amber shrink-0" />
          <span>
            Up to {rate.max_pax} guest{rate.max_pax !== 1 ? "s" : ""} included
            {rate.extra_pax_fee_php != null && (
              <span className="text-mocha"> · +{formatPHP(rate.extra_pax_fee_php)}/extra guest</span>
            )}
          </span>
        </div>
      )}
      <div className="mt-5 flex items-baseline gap-2">
        <span
          className={`text-3xl md:text-4xl font-display font-bold tracking-tight ${
            highlight ? "text-amber text-glow-amber" : "text-cream"
          }`}
        >
          {formatPHP(rate.price_php)}
        </span>
        <span className="font-mono text-xs uppercase tracking-widest text-mocha">
          / {rate.unit}
        </span>
      </div>
    </div>
  );
}
