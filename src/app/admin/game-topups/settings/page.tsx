import Link from "next/link";
import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings } from "@/lib/game-topups/config";
import { formatPHP } from "@/lib/utils";
import { saveTopupSettingsAction, saveCatalogRowAction, syncPricesNowAction } from "./_actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-line-bright bg-bg px-3 py-2 font-mono text-sm text-cream focus:border-amber focus:outline-none";

export default async function GameTopupSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireFullAdmin();
  const sp = await searchParams;
  const settings = await getTopupSettings();
  const admin = getSupabaseAdmin();
  const { data: catalog } = await admin
    .from("game_topup_catalog")
    .select("id, sku, game, region, vp_amount, label, codashop_price, discount_pct, customer_price, active, frozen, last_synced_at")
    .order("game", { ascending: true })
    .order("sort_order", { ascending: true });

  return (
    <section className="container-edge max-w-5xl py-12 space-y-8">
      <div>
        <Link href="/admin/game-topups" title="Back to fulfilment" className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber">
          ← Fulfilment
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-cream">Game Top-Up prices &amp; settings</h1>
        <p className="mt-1 text-sm text-cream-dim">
          Codashop prices auto-pull daily (hit <span className="text-amber">Pull now</span> to refresh anytime). Set your discount — your selling price = Codashop price × (1 − discount%).
        </p>
      </div>

      {sp.ok && <p className="rounded-lg border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-xs text-phosphor">// {sp.ok === "1" ? "saved" : sp.ok}</p>}
      {sp.error && <p className="rounded-lg border border-red-700 bg-red-950/20 px-4 py-2 font-mono text-xs text-red-400">// {sp.error}</p>}

      {/* Settings */}
      <form action={saveTopupSettingsAction} className="space-y-5 rounded-2xl border border-line-bright bg-bg-card p-6">
        <label className="flex items-center gap-3">
          <input type="checkbox" name="gt_enabled" defaultChecked={settings.enabled} className="h-4 w-4 accent-amber" />
          <span className="font-mono text-sm text-cream">Game top-ups enabled (storefront live)</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="gt_require_codashop_up" defaultChecked={settings.requireCodashopUp} className="mt-0.5 h-4 w-4 accent-amber" />
          <span className="font-mono text-sm text-cream">
            Block payment when Codashop is down <span className="text-mocha">(recommended — never take money we can&rsquo;t fulfil; turn off only if this ever wrongly blocks sales)</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="Default discount % (global)">
            <input className={inputCls} name="gt_discount_pct" type="number" min={0} max={90} step={0.5} defaultValue={settings.discountPctGlobal} />
          </Labeled>
          <Labeled label="Daily Vision OCR cap (cost ceiling)">
            <input className={inputCls} name="gt_vision_daily_cap" type="number" min={0} step={1} defaultValue={settings.visionDailyCap} />
          </Labeled>
          <Labeled label="Fulfilment SLA (minutes → auto-refund sweep)">
            <input className={inputCls} name="gt_sla_minutes" type="number" min={5} step={5} defaultValue={settings.slaMinutes} />
          </Labeled>
          <Labeled label="Price-sync freeze threshold (±%)">
            <input className={inputCls} name="gt_price_freeze_threshold_pct" type="number" min={1} step={1} defaultValue={settings.priceFreezeThresholdPct} />
          </Labeled>
          <Labeled label="OCR lock #1 (minutes, after 3 fails)">
            <input className={inputCls} name="gt_ocr_lock_minutes_1" type="number" min={1} step={1} defaultValue={settings.ocrLockMinutes1} />
          </Labeled>
          <Labeled label="OCR lock #2+ (minutes, repeat fails)">
            <input className={inputCls} name="gt_ocr_lock_minutes_2" type="number" min={1} step={1} defaultValue={settings.ocrLockMinutes2} />
          </Labeled>
        </div>
        <button type="submit" title="Save settings" className="key-cap key-cap-primary">
          Save settings
        </button>
      </form>

      {/* Catalog */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-cream">Catalog</h2>
          <form action={syncPricesNowAction}>
            <button type="submit" title="Pull the latest Codashop prices right now" className="key-cap">
              ⟳ Pull Codashop prices now
            </button>
          </form>
        </div>
        <p className="font-mono text-xs text-mocha">
          // prices auto-pull from Codashop daily; customer price = Codashop price × (1 − discount%). A suspicious jump freezes the row (hidden from the store + skipped by price-sync) until you unfreeze it.
        </p>
        <div className="space-y-2">
          {(catalog ?? []).map((c) => (
            <form
              key={c.id as string}
              action={saveCatalogRowAction}
              className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line bg-bg-card p-3 md:grid-cols-[1.4fr_1fr_1fr_0.9fr_auto]"
            >
              <input type="hidden" name="id" value={c.id as string} />
              <div>
                <p className="font-display text-sm font-semibold text-cream">{c.label as string}</p>
                <p className="font-mono text-[0.65rem] uppercase text-mocha">
                  {c.game as string} · {c.region as string} · sells {formatPHP(Number(c.customer_price))}
                </p>
                <p className="font-mono text-[0.6rem] text-mocha/80">
                  {c.last_synced_at
                    ? `auto-pulled ${new Date(c.last_synced_at as string).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
                    : "not pulled yet"}
                </p>
              </div>
              <Labeled label="Codashop ₱ (auto)">
                <input className={inputCls} name="codashop_price" type="number" min={0} step={1} defaultValue={Number(c.codashop_price)} />
              </Labeled>
              <Labeled label="Discount %">
                <input className={inputCls} name="discount_pct" type="number" min={0} max={90} step={0.5} defaultValue={Number(c.discount_pct)} />
              </Labeled>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase text-cream-dim">
                  <input type="checkbox" name="active" defaultChecked={!!c.active} className="h-3.5 w-3.5 accent-amber" /> active
                </label>
                <label className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase text-cream-dim">
                  <input type="checkbox" name="frozen" defaultChecked={!!c.frozen} className="h-3.5 w-3.5 accent-rgb-r" /> frozen
                </label>
              </div>
              <button type="submit" title={`Save ${c.label as string}`} className="key-cap">
                Save
              </button>
            </form>
          ))}
        </div>
      </div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-mocha">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
