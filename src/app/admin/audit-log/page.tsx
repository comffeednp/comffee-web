import Link from "next/link";
import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  diff_jsonb: unknown;
  created_at: string;
}

interface Props {
  searchParams: Promise<{ entity?: string; action?: string }>;
}

const ENTITY_TYPES = [
  "branches",
  "branch_amenities",
  "branch_photos",
  "branch_rates",
  "menu_categories",
  "menu_items",
  "branch_menu_overrides",
  "site_settings",
  "airbnb_calendars",
  "promo_codes",
];

export default async function AuditLogPage({ searchParams }: Props) {
  await requireFullAdmin();
  const { entity, action } = await searchParams;
  const supabase = await getSupabaseServer();

  let q = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (entity) q = q.eq("entity_type", entity);
  if (action) q = q.eq("action", action);
  const { data } = await q;
  const rows = (data ?? []) as AuditRow[];

  // Resolve actor names
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]),
  );
  const actorsById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: admins } = await supabase
      .from("admin_users")
      .select("auth_user_id, full_name")
      .in("auth_user_id", actorIds);
    for (const a of admins ?? []) {
      actorsById.set(a.auth_user_id as string, a.full_name as string);
    }
  }

  return (
    <section className="container-edge py-12">
      <p className="terminal-label">/audit-log</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        Audit log
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Every admin write to branches, menu, settings, promos. Use this to answer &ldquo;who changed this&rdquo;.
      </p>

      {/* Filters */}
      <div className="mt-8 flex items-center gap-2 flex-wrap">
        <FilterChip href="/admin/audit-log" active={!entity && !action}>
          All
        </FilterChip>
        {["insert", "update", "delete"].map((a) => (
          <FilterChip
            key={a}
            href={`/admin/audit-log?action=${a}`}
            active={action === a}
          >
            {a}
          </FilterChip>
        ))}
        <span className="font-mono text-[0.7rem] text-mocha mx-2">|</span>
        {ENTITY_TYPES.map((e) => (
          <FilterChip
            key={e}
            href={`/admin/audit-log?entity=${e}`}
            active={entity === e}
          >
            {e}
          </FilterChip>
        ))}
      </div>

      <ul className="mt-8 space-y-3">
        {rows.map((row) => {
          const actorName = row.actor_id
            ? actorsById.get(row.actor_id) ?? row.actor_id.slice(0, 8)
            : "system";
          return (
            <li
              key={row.id}
              className="border border-line-bright bg-bg-card rounded-xl overflow-hidden"
            >
              <details>
                <summary className="px-5 py-4 cursor-pointer hover:bg-bg-elev/40 list-none">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <ActionChip action={row.action} />
                      <span className="font-mono text-cream truncate">
                        {row.entity_type}
                      </span>
                      <span className="font-mono text-[0.7rem] text-mocha">
                        {row.entity_id?.slice(0, 8) ?? "—"}
                      </span>
                      <span className="text-cream-dim text-xs">
                        by {actorName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[0.65rem] text-mocha">
                        {formatDateTime(row.created_at)}
                      </span>
                      <ChevronRight className="h-3 w-3 text-mocha" />
                    </div>
                  </div>
                </summary>
                <div className="px-5 py-4 border-t border-line bg-bg">
                  <pre className="font-mono text-[0.7rem] text-cream-dim whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                    {JSON.stringify(row.diff_jsonb, null, 2)}
                  </pre>
                </div>
              </details>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="font-mono text-sm text-mocha text-center py-12">
            // no entries match these filters
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
    <Link
      href={href}
      className={`font-mono text-[0.7rem] uppercase tracking-[0.18em] px-3 py-2 rounded-md border transition ${
        active
          ? "bg-amber text-bg border-amber"
          : "border-line-bright text-cream-dim hover:text-amber hover:border-amber/60"
      }`}
    >
      {children}
    </Link>
  );
}

function ActionChip({ action }: { action: string }) {
  const map: Record<string, string> = {
    insert: "text-phosphor border-phosphor/40",
    update: "text-amber border-amber/40",
    delete: "text-red-400 border-red-700/50",
  };
  return (
    <span
      className={`inline-block font-mono text-[0.65rem] uppercase tracking-widest px-2 py-1 border rounded ${map[action] ?? ""}`}
    >
      {action}
    </span>
  );
}
