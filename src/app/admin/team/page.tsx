import { requireSuperAdmin } from "@/lib/auth/require-admin";
import PartnersManager from "./PartnersManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireSuperAdmin(); // owner-only

  return (
    <section className="container-edge py-10 max-w-2xl">
      <p className="terminal-label">/admin/team</p>
      <h1 className="mt-2 font-display text-3xl md:text-4xl font-bold text-cream tracking-tight">
        Partners
      </h1>
      <p className="mt-3 text-sm text-cream-dim max-w-xl">
        Read-only partner accounts. They can see everything you see — sales, bookings, calendars, and
        guest chats — but they <strong>cannot edit anything or message guests</strong>. Add a partner
        by email; they log in with the temp password you share.
      </p>
      <PartnersManager />
    </section>
  );
}
