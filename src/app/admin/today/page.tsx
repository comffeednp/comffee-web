import Link from "next/link";
import { getAdminScope } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatDateTime, formatPHP } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Clock,
  Coffee,
  Cpu,
  MessageSquare,
  Power,
} from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Owner-focused "what needs my attention right now" view.
 * Shows: today's pickups, today's check-ins/check-outs, active station sessions,
 * pending hold expiries, unread chats, and pending station requests.
 */
export default async function AdminTodayPage() {
  const { branchId } = await getAdminScope();
  const supabase = await getSupabaseServer();

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  // Every panel here is branch-relevant — scope all of them to a partner's branch.
  let pickupsQ = supabase
    .from("orders")
    .select("id, customer_name, total_php, scheduled_for, status, payment_status, branch:branches(name)")
    .gte("scheduled_for", startOfDay)
    .lt("scheduled_for", endOfDay)
    .in("status", ["placed", "preparing", "ready"])
    .order("scheduled_for", { ascending: true });
  let checkInsQ = supabase
    .from("reservations")
    .select("id, guest_name, check_in, check_out, total_php, status, branch:branches(name)")
    .eq("check_in", todayIso)
    .in("status", ["confirmed", "pending_hold"])
    .order("guest_name", { ascending: true });
  let checkOutsQ = supabase
    .from("reservations")
    .select("id, guest_name, check_in, check_out, branch:branches(name)")
    .eq("check_out", todayIso)
    .eq("status", "confirmed")
    .order("guest_name", { ascending: true });
  let activeStationsQ = supabase
    .from("internet_reservations")
    .select("id, station_label, actual_start, requested_start, requested_end, time_extended_minutes, member:members(full_name), branch:branches(name)")
    .eq("status", "active")
    .order("actual_start", { ascending: true });
  let holdsExpiringQ = supabase
    .from("reservations")
    .select("id, guest_name, hold_expires_at, branch:branches(name)")
    .eq("status", "pending_hold")
    .order("hold_expires_at", { ascending: true })
    .limit(20);
  let openChatsQ = supabase
    .from("chat_conversations")
    .select("id, customer_name, last_message_at")
    .eq("status", "open")
    .order("last_message_at", { ascending: false })
    .limit(10);
  let pendingStationReqsQ = supabase
    .from("internet_reservations")
    .select("id, station_label, requested_start, member:members(full_name), branch:branches(name)")
    .eq("status", "requested")
    .order("created_at", { ascending: false });
  if (branchId) {
    pickupsQ = pickupsQ.eq("branch_id", branchId) as typeof pickupsQ;
    checkInsQ = checkInsQ.eq("branch_id", branchId) as typeof checkInsQ;
    checkOutsQ = checkOutsQ.eq("branch_id", branchId) as typeof checkOutsQ;
    activeStationsQ = activeStationsQ.eq("branch_id", branchId) as typeof activeStationsQ;
    holdsExpiringQ = holdsExpiringQ.eq("branch_id", branchId) as typeof holdsExpiringQ;
    openChatsQ = openChatsQ.eq("branch_id", branchId) as typeof openChatsQ;
    pendingStationReqsQ = pendingStationReqsQ.eq("branch_id", branchId) as typeof pendingStationReqsQ;
  }

  const [
    pickupsRes,
    checkInsRes,
    checkOutsRes,
    activeStationsRes,
    holdsExpiringRes,
    openChatsRes,
    pendingStationReqsRes,
  ] = await Promise.all([
    pickupsQ, checkInsQ, checkOutsQ, activeStationsQ, holdsExpiringQ, openChatsQ, pendingStationReqsQ,
  ]);

  const pickups = pickupsRes.data ?? [];
  const checkIns = checkInsRes.data ?? [];
  const checkOuts = checkOutsRes.data ?? [];
  const activeStations = activeStationsRes.data ?? [];
  const holdsExpiring = holdsExpiringRes.data ?? [];
  const openChats = openChatsRes.data ?? [];
  const pendingStationReqs = pendingStationReqsRes.data ?? [];

  return (
    <section className="container-edge py-12">
      <p className="terminal-label">/today</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl font-bold text-cream tracking-tight">
        Today
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        {today.toLocaleDateString("en-PH", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}{" "}
        · what needs your attention right now
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Section
          icon={Power}
          title="Active station sessions"
          count={activeStations.length}
          link="/admin/internet-reservations?status=active"
          empty="No timers running."
        >
          {activeStations.map((s) => {
            const m = pickFirst(s.member as RelOrArr<{ full_name?: string }>);
            const b = pickFirst(s.branch as RelOrArr<{ name?: string }>);
            return (
              <Row
                key={s.id}
                title={m?.full_name ?? "—"}
                meta={`${b?.name ?? "—"} · ${s.station_label}`}
                accent={
                  s.actual_start
                    ? `started ${formatDateTime(s.actual_start as string)}`
                    : "no start time"
                }
                href={`/admin/internet-reservations/${s.id}`}
              />
            );
          })}
        </Section>

        <Section
          icon={Coffee}
          title="Pickups today"
          count={pickups.length}
          link="/admin/orders"
          empty="Nothing scheduled."
        >
          {pickups.map((o) => {
            const b = pickFirst(o.branch as RelOrArr<{ name?: string }>);
            return (
              <Row
                key={o.id}
                title={o.customer_name}
                meta={`${b?.name ?? "—"} · ${formatPHP(Number(o.total_php))} · ${o.status}`}
                accent={o.scheduled_for ? formatDateTime(o.scheduled_for) : "ASAP"}
                href={`/admin/orders/${o.id}`}
              />
            );
          })}
        </Section>

        <Section
          icon={Calendar}
          title="Check-ins today"
          count={checkIns.length}
          link="/admin/bookings"
          empty="No arrivals today."
        >
          {checkIns.map((r) => {
            const b = pickFirst(r.branch as RelOrArr<{ name?: string }>);
            return (
              <Row
                key={r.id}
                title={r.guest_name ?? "—"}
                meta={`${b?.name ?? "—"} · ${formatPHP(Number(r.total_php ?? 0))} · ${r.status}`}
                accent={`out ${r.check_out}`}
                href={`/admin/bookings/${r.id}`}
              />
            );
          })}
        </Section>

        <Section
          icon={Calendar}
          title="Check-outs today"
          count={checkOuts.length}
          link="/admin/bookings"
          empty="No departures today."
        >
          {checkOuts.map((r) => {
            const b = pickFirst(r.branch as RelOrArr<{ name?: string }>);
            return (
              <Row
                key={r.id}
                title={r.guest_name ?? "—"}
                meta={`${b?.name ?? "—"} · since ${r.check_in}`}
                accent="checking out"
                href={`/admin/bookings/${r.id}`}
              />
            );
          })}
        </Section>

        <Section
          icon={Cpu}
          title="Pending station requests"
          count={pendingStationReqs.length}
          link="/admin/internet-reservations?status=requested"
          empty="Nothing pending."
        >
          {pendingStationReqs.map((r) => {
            const m = pickFirst(r.member as RelOrArr<{ full_name?: string }>);
            const b = pickFirst(r.branch as RelOrArr<{ name?: string }>);
            return (
              <Row
                key={r.id}
                title={m?.full_name ?? "—"}
                meta={`${b?.name ?? "—"} · ${r.station_label}`}
                accent={formatDateTime(r.requested_start as string)}
                href={`/admin/internet-reservations/${r.id}`}
              />
            );
          })}
        </Section>

        <Section
          icon={MessageSquare}
          title="Open chats"
          count={openChats.length}
          link="/admin/chat"
          empty="Inbox clear."
        >
          {openChats.map((c) => (
            <Row
              key={c.id}
              title={c.customer_name ?? "Anonymous"}
              meta={formatDateTime(c.last_message_at as string)}
              accent="open"
              href={`/admin/chat?conversation=${c.id}`}
            />
          ))}
        </Section>

        <Section
          icon={AlertTriangle}
          title="Holds expiring soon"
          count={holdsExpiring.length}
          link="/admin/bookings?status=active"
          empty="No active holds."
          warn
        >
          {holdsExpiring.map((h) => {
            const b = pickFirst(h.branch as RelOrArr<{ name?: string }>);
            return (
              <Row
                key={h.id}
                title={h.guest_name ?? "—"}
                meta={b?.name ?? "—"}
                accent={h.hold_expires_at ? formatDateTime(h.hold_expires_at as string) : "—"}
                href={`/admin/bookings/${h.id}`}
              />
            );
          })}
        </Section>
      </div>
    </section>
  );
}

type RelOrArr<T> = T | T[] | null | undefined;
function pickFirst<T extends object>(rel: RelOrArr<T>): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function Section({
  icon: Icon,
  title,
  count,
  link,
  empty,
  warn,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  link: string;
  empty: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border rounded-xl bg-bg-card overflow-hidden ${
        warn && count > 0 ? "border-amber/50 glow-amber" : "border-line-bright"
      }`}
    >
      <div className="px-5 py-4 border-b border-line bg-bg-soft flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${warn && count > 0 ? "text-amber" : "text-amber"}`} />
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-cream">
            {title}
          </span>
          <span className="font-mono text-[0.7rem] text-mocha">({count})</span>
        </div>
        <Link
          href={link}
          className="font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim hover:text-amber inline-flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="divide-y divide-line max-h-72 overflow-y-auto">
        {count === 0 ? (
          <li className="px-5 py-8 text-center font-mono text-xs text-mocha">// {empty}</li>
        ) : (
          children
        )}
      </ul>
    </div>
  );
}

function Row({
  title,
  meta,
  accent,
  href,
}: {
  title: string;
  meta: string;
  accent: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block px-5 py-3 hover:bg-bg-elev/40 transition flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-cream truncate text-sm">{title}</p>
          <p className="font-mono text-[0.7rem] text-mocha mt-0.5 truncate">{meta}</p>
        </div>
        <span className="font-mono text-[0.65rem] text-amber whitespace-nowrap flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {accent}
        </span>
      </Link>
    </li>
  );
}
