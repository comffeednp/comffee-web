import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  addAirbnbCalendarAction,
  deleteAirbnbCalendarAction,
  syncNowAction,
} from "../_actions/airbnb";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { SyncButton } from "@/components/admin/SyncButton";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function AirbnbCalendarsPage({ searchParams }: Props) {
  await requireFullAdmin();
  const { ok, error } = await searchParams;
  const supabase = await getSupabaseServer();
  const [calsRes, branchesRes] = await Promise.all([
    supabase
      .from("airbnb_calendars")
      .select("*, branch:branches(id, slug, name, type)")
      .order("id"),
    supabase
      .from("branches")
      .select("id, name, slug, type")
      .eq("type", "playcation")
      .order("sort_order"),
  ]);
  const calendars = calsRes.data ?? [];
  const branches = branchesRes.data ?? [];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <section className="container-edge py-12 max-w-4xl">
      <p className="terminal-label">/airbnb-calendars</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        Airbnb sync
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Two-way sync with Airbnb to prevent double bookings. We pull every 15 minutes; Airbnb refreshes its imported calendars every 2-3 hours.
      </p>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// {ok}</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      {/* INCOMING — Airbnb → us */}
      <div className="mt-10">
        <h2 className="font-display text-2xl font-bold text-cream">Incoming feeds</h2>
        <p className="mt-1 text-sm text-cream-dim">
          Paste each Playcation listing&apos;s Airbnb iCal export URL here. We pull these every 15 minutes.
        </p>

        <ul className="mt-6 space-y-3">
          {calendars.map((c) => (
            <li
              key={c.id}
              className="p-4 border border-line-bright rounded-lg bg-bg-card flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-display font-semibold text-cream">
                    {c.branch?.name ?? "—"}
                  </span>
                  {c.label && (
                    <span className="font-mono text-[0.65rem] uppercase text-mocha">
                      {c.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-[0.7rem] text-cream-dim truncate">
                  {c.ical_url}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[0.7rem] font-mono">
                  {c.last_synced_at ? (
                    <span className="text-phosphor">
                      ✓ synced {formatDateTime(c.last_synced_at)}
                    </span>
                  ) : (
                    <span className="text-mocha">// never synced</span>
                  )}
                  {c.last_sync_error && (
                    <span className="text-red-400">! {c.last_sync_error}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <form action={syncNowAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SyncButton />
                </form>
                <form action={deleteAirbnbCalendarAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-red-400 hover:text-red-300 p-2" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </li>
          ))}
          {calendars.length === 0 && (
            <li className="font-mono text-sm text-mocha">
              // no calendars yet — add one below
            </li>
          )}
        </ul>

        <form
          action={addAirbnbCalendarAction}
          className="mt-6 p-5 border border-line-bright rounded-lg bg-bg-card grid gap-3 md:grid-cols-[2fr_3fr_1fr_auto]"
        >
          <select name="branch_id" required className="admin-input">
            <option value="">— Playcation branch *</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            name="ical_url"
            type="url"
            placeholder="https://www.airbnb.com/calendar/ical/... *"
            required
            className="admin-input"
          />
          <input name="label" placeholder="Label (optional)" className="admin-input" />
          <button type="submit" title="Add this Airbnb calendar feed" className="key-cap !py-2 !px-3">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>

        <p className="mt-3 font-mono text-[0.7rem] text-mocha">
          // get the URL from your Airbnb listing → Calendar → Availability settings → Sync calendars → Export Calendar
        </p>
      </div>

      {/* OUTGOING — us → Airbnb */}
      <div className="mt-16">
        <h2 className="font-display text-2xl font-bold text-cream">Outgoing feeds</h2>
        <p className="mt-1 text-sm text-cream-dim">
          Paste these URLs into Airbnb&apos;s &ldquo;Import Calendar&rdquo; per listing so Airbnb sees our website bookings.
        </p>

        <ul className="mt-6 space-y-3">
          {branches.map((b) => {
            const url = `${siteUrl}/api/ical/${b.slug}`;
            return (
              <li
                key={b.id}
                className="p-4 border border-line-bright rounded-lg bg-bg-card flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-display font-semibold text-cream">{b.name}</div>
                  <div className="mt-1 font-mono text-[0.7rem] text-cream-dim truncate">
                    {url}
                  </div>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open iCal feed for ${b.name}`}
                  className="flex items-center gap-1.5 border border-line-bright rounded-md px-3 py-1.5 text-[0.7rem] font-mono uppercase tracking-widest text-cream-dim hover:text-amber hover:border-amber/60"
                >
                  Open
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <style>{`
        .admin-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-size: 0.9rem;
          color-scheme: dark;
        }
      `}</style>
    </section>
  );
}
