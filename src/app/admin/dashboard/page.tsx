import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  Building2,
  Calendar,
  Coffee,
  Cpu,
  Inbox,
  MessageSquare,
  Monitor,
  Power,
  Settings,
  ShoppingBag,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await getSupabaseServer();

  const [
    { count: branchesCount },
    { count: menuCount },
    { count: inboxCount },
    { count: activeBookings },
    { count: pendingHolds },
    { count: openOrders },
    { count: stationRequests },
    { count: activeStations },
    { count: openChats },
  ] = await Promise.all([
    supabase.from("branches").select("id", { count: "exact", head: true }),
    supabase.from("menu_items").select("id", { count: "exact", head: true }),
    supabase
      .from("contact_form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("handled", false),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed"),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_hold"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["placed", "preparing", "ready"]),
    supabase
      .from("internet_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested"),
    supabase
      .from("internet_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("chat_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  const tiles = [
    { href: "/admin/chat", icon: MessageSquare, label: "Open chats", value: openChats ?? 0 },
    { href: "/admin/branches", icon: Building2, label: "Branches", value: branchesCount ?? 0 },
    { href: "/admin/bookings", icon: Calendar, label: "Confirmed bookings", value: activeBookings ?? 0 },
    { href: "/admin/bookings?status=active", icon: Power, label: "Pending holds", value: pendingHolds ?? 0 },
    { href: "/admin/orders", icon: ShoppingBag, label: "Open orders", value: openOrders ?? 0 },
    { href: "/admin/internet-reservations?status=requested", icon: Cpu, label: "Station requests", value: stationRequests ?? 0 },
    { href: "/admin/internet-reservations?status=active", icon: Monitor, label: "Active sessions", value: activeStations ?? 0 },
    { href: "/admin/menu", icon: Coffee, label: "Menu items", value: menuCount ?? 0 },
    { href: "/admin/contact-submissions", icon: Inbox, label: "Unread messages", value: inboxCount ?? 0 },
    { href: "/admin/settings", icon: Settings, label: "Site settings", value: "→" },
  ];

  return (
    <section className="container-edge py-12">
      <p className="terminal-label">/dashboard</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        At a glance
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Counts you can act on. Live chat and member reservations arrive in later phases.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ href, icon: Icon, label, value }) => (
          <Link
            key={href}
            href={href}
            className="group p-6 border border-line-bright bg-bg-card rounded-xl hover:border-amber/50 transition"
          >
            <div className="flex items-start justify-between">
              <Icon className="h-5 w-5 text-amber" />
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                manage →
              </span>
            </div>
            <p className="mt-6 font-display text-4xl font-bold text-cream group-hover:text-amber transition">
              {value}
            </p>
            <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim">
              {label}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-12 p-6 border border-line bg-bg-card rounded-xl">
        <p className="terminal-label">// next on the roadmap</p>
        <ul className="mt-4 space-y-2 text-sm text-cream-dim font-mono">
          <li className="text-phosphor">✓ Phase 0+1 — Marketing site + admin CRUD</li>
          <li className="text-phosphor">✓ Phase 2 — Playcation booking + Airbnb iCal sync + PayMongo</li>
          <li className="text-phosphor">✓ Phase 3 — Advance menu orders + cart + checkout</li>
          <li className="text-phosphor">✓ Phase 4 — Members + internet cafe reservations + manual timer</li>
          <li className="text-phosphor">✓ Phase 5 — Live chat + Realtime + admin PWA + FCM push</li>
        </ul>
      </div>
    </section>
  );
}
