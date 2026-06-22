import Link from "next/link";
import Image from "next/image";
import { getSupabaseServer } from "@/lib/supabase/server";
import { LogOut } from "lucide-react";
import { signOutAction } from "./_actions/auth";
import NavScroller from "./NavScroller";
import AdminChatFloat from "@/components/admin/AdminChatFloat";

export const dynamic = "force-dynamic";

const navLinks = [
  { href: "/admin/today", label: "Today" },
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/chat", label: "Chat" },
  { href: "/admin/saved-replies", label: "Saved Replies" },
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/pc-reservations", label: "PC Reservations" },
  { href: "/admin/topups", label: "Top-ups" },
  { href: "/admin/game-topups", label: "Game Top-Ups" },
  { href: "/admin/internet-reservations", label: "Stations" },
  { href: "/admin/airbnb-calendars", label: "Airbnb" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/promo-codes", label: "Promos" },
  { href: "/admin/audit-log", label: "Audit" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/contact-submissions", label: "Inbox" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  type AdminBrief = { id: string; full_name: string; role: string };
  let admin: AdminBrief | null = null;
  if (user) {
    const { data } = await supabase
      .from("admin_users")
      .select("id, full_name, role")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (data) admin = data as AdminBrief;
  }

  // Branch-partners get a reduced, ops-only nav (their branch only).
  const PARTNER_HREFS = new Set([
    "/admin/today", "/admin/dashboard", "/admin/chat", "/admin/saved-replies", "/admin/bookings",
    "/admin/calendar", "/admin/orders", "/admin/pc-reservations",
    "/admin/topups", "/admin/internet-reservations",
  ]);
  const links =
    admin?.role === "partner"
      ? navLinks.filter((l) => PARTNER_HREFS.has(l.href))
      : admin?.role === "super_admin"
        ? [...navLinks, { href: "/admin/team", label: "Team" }]
        : navLinks;
  const canReply = admin?.role !== "partner";

  return (
    <div className="min-h-screen bg-bg-soft flex flex-col">
      <header className="border-b border-line bg-bg sticky top-0 z-[100]" style={{ backgroundColor: 'var(--color-bg)' }}>
        {/* Identity row */}
        <div className="container-edge h-12 flex items-center justify-between gap-4">
          <Link href={admin ? "/admin/dashboard" : "/admin"} title="Go to admin dashboard" className="flex items-center gap-2.5 shrink-0">
            <div className="h-12 w-12 overflow-hidden relative shrink-0">
              <Image
                src="/comffee-logo.png"
                alt="Comffee"
                width={280}
                height={157}
                priority
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            </div>
            <span className="font-mono text-sm font-bold tracking-wider text-cream">
              Comffee<span className="text-mocha">/admin</span>
            </span>
          </Link>

          {admin ? (
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-[0.7rem] text-mocha hidden sm:inline truncate max-w-[14rem]">
                {admin.full_name} · {admin.role}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  title="Sign out of admin"
                  className="flex items-center gap-2 border border-line-bright rounded-md px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-cream-dim hover:text-cream hover:border-cream transition"
                >
                  <LogOut className="h-3 w-3" />
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <span className="font-mono text-[0.7rem] uppercase text-mocha shrink-0">// not signed in</span>
          )}
        </div>

        {/* Nav row — scrolls horizontally, never causes page overflow */}
        {admin && (
          <NavScroller>
            <nav className="container-edge flex items-center gap-0.5 h-10 w-max min-w-full">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  title={`Go to ${l.label}`}
                  className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-cream-dim hover:text-cream whitespace-nowrap px-3 py-2 transition shrink-0"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </NavScroller>
        )}
      </header>

      <main className="flex-1 relative z-0 isolate">{children}</main>

      {admin && (
        <AdminChatFloat adminId={admin.id} adminName={admin.full_name} canReply={canReply} />
      )}
    </div>
  );
}
