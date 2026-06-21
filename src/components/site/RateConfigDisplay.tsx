import { Cpu, CircuitBoard, MemoryStick, Monitor, Mouse, Keyboard, Headphones, Crown, CreditCard, Coins, Gift, Sparkles, type LucideIcon } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import type { RateConfig, RateCategory, RateTier } from "@/lib/supabase/types";

// Display-only rate sheet authored in the POS Reservation tab (branches.rate_config). Server
// component — no interactivity, so no "use client" and no title attrs are needed. Renders INSTEAD
// of the flat <RateCardList> when the owner has configured rate_config. Does NOT bill (PanCafe
// owns the real tariffs); this is purely the public-facing price board. Styling mirrors RateCard.

// "90" → "1h 30m", "60" → "1h", "45" → "45m". Returns null when minutes is unset.
function formatDuration(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function TierRow({ tier }: { tier: RateTier }) {
  const duration = formatDuration(tier.minutes);
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-t border-line first:border-t-0">
      <div className="min-w-0">
        <span className="text-sm text-cream">{tier.label}</span>
        {duration && (
          <span className="ml-2 font-mono text-xs uppercase tracking-widest text-mocha">
            · {duration}
          </span>
        )}
      </div>
      <span className="font-display text-lg font-semibold text-amber shrink-0">
        {formatPHP(tier.price)}
      </span>
    </div>
  );
}

function CategoryCard({ category }: { category: RateCategory }) {
  return (
    <div className="relative p-6 rounded-xl border border-line-bright bg-bg-card transition hover:border-amber/40">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3 w-3 rounded-full shrink-0 ring-1 ring-line-bright"
          style={{ backgroundColor: category.color || "#c0392b" }}
        />
        <h3 className="font-display text-xl font-semibold text-cream truncate">{category.name}</h3>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.7rem] uppercase tracking-widest text-mocha">
        {category.pc_count != null && (
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-phosphor" /> {category.pc_count} PCs
          </span>
        )}
        {category.member_rate != null && (
          <span className="inline-flex items-center gap-1.5 text-phosphor">
            <Crown className="h-3.5 w-3.5" /> Members {formatPHP(category.member_rate)}/hr
          </span>
        )}
      </div>

      {category.tiers && category.tiers.length > 0 && (
        <div className="mt-4">
          {category.tiers.map((tier, i) => (
            <TierRow key={`${tier.label}-${i}`} tier={tier} />
          ))}
        </div>
      )}

      <PcSpecs specs={category.pc_specs} />
    </div>
  );
}

// Per-tier PC spec sheet (set in the POS Reservation tab — 2026-06-22): 7 typed, labeled fields, each
// optional. Blank ones are hidden. Renders nothing when the tier has no specs (back-compat: older rows
// used monitor/refresh_hz/mouse_dpi/model — those keys are simply absent here and fall through).
function PcSpecs({ specs }: { specs?: RateCategory["pc_specs"] }) {
  if (!specs) return null;
  const rows: { Icon: LucideIcon; label: string; value?: string }[] = [
    { Icon: Cpu, label: "CPU", value: specs.cpu },
    { Icon: CircuitBoard, label: "GPU", value: specs.gpu },
    { Icon: MemoryStick, label: "RAM", value: specs.ram },
    { Icon: Monitor, label: "Monitor", value: specs.monitor },
    { Icon: Mouse, label: "Mouse", value: specs.mouse },
    { Icon: Keyboard, label: "Keyboard", value: specs.keyboard },
    { Icon: Headphones, label: "Headset", value: specs.headset },
  ].filter((r) => r.value && r.value.trim());
  const description = specs.description;
  if (rows.length === 0 && !description) return null;
  return (
    <div className="mt-5 pt-5 border-t border-line space-y-3">
      {rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-sm min-w-0">
              <r.Icon className="h-4 w-4 text-phosphor shrink-0" aria-hidden />
              <span className="font-mono text-[0.62rem] uppercase tracking-widest text-mocha shrink-0">
                {r.label}
              </span>
              <span className="text-cream truncate">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {description && <p className="text-sm text-cream-dim leading-relaxed italic">{description}</p>}
    </div>
  );
}

function MembershipBlock({ membership }: { membership: RateConfig["membership"] }) {
  const { fee, topup_bonus_pct, members_avail_promos, drink_free_hour } = membership;
  const hasAnything =
    fee != null || topup_bonus_pct != null || members_avail_promos || drink_free_hour;
  if (!hasAnything) return null;

  return (
    <div className="mt-8 p-6 rounded-xl border border-amber/40 bg-bg-card glow-amber">
      <div className="flex items-center gap-2.5">
        <CreditCard className="h-4 w-4 text-amber" />
        <p className="terminal-label">membership &amp; top-up</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fee != null && (
          <div className="flex items-center gap-2.5 text-sm text-cream-dim">
            <Coins className="h-4 w-4 text-amber shrink-0" />
            <span>
              <span className="font-display text-cream font-semibold">{formatPHP(fee)}</span>{" "}
              one-time membership fee
            </span>
          </div>
        )}
        {topup_bonus_pct != null && (
          <div className="flex items-center gap-2.5 text-sm text-cream-dim">
            <Gift className="h-4 w-4 text-amber shrink-0" />
            <span>
              <span className="font-display text-cream font-semibold">+{topup_bonus_pct}%</span>{" "}
              top-up bonus
            </span>
          </div>
        )}
        {drink_free_hour && (
          <div className="flex items-center gap-2.5 text-sm text-cream-dim">
            <Sparkles className="h-4 w-4 text-amber shrink-0" />
            <span>Every drink = 1 free hour</span>
          </div>
        )}
        {members_avail_promos && (
          <div className="flex items-center gap-2.5 text-sm text-cream-dim">
            <Sparkles className="h-4 w-4 text-amber shrink-0" />
            <span>Members get exclusive promos</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RateConfigDisplay({ config }: { config: RateConfig }) {
  const categories = config.categories ?? [];

  return (
    <div className="mt-12">
      {config.total_pcs != null && (
        <p className="font-mono text-xs uppercase tracking-widest text-phosphor inline-flex items-center gap-2">
          <Cpu className="h-4 w-4" /> {config.total_pcs} stations on the floor
        </p>
      )}

      {categories.length > 0 && (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, i) => (
            <CategoryCard key={`${category.name}-${i}`} category={category} />
          ))}
        </div>
      )}

      {config.membership && <MembershipBlock membership={config.membership} />}
    </div>
  );
}
