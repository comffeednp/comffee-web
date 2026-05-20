import { requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ReservationCalendar from "@/components/admin/ReservationCalendar";
import type { CalendarReservation } from "@/components/admin/ReservationCalendar";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();

  // Fetch reservations ±6 months around today
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  const to = new Date();
  to.setMonth(to.getMonth() + 6);

  const { data: rows } = await supabase
    .from("reservations")
    .select(`
      id, check_in, check_out, guest_name, source, status,
      member_id,
      branch:branches(name)
    `)
    .in("status", ["pending_hold", "confirmed"])
    .gte("check_out", from.toISOString().slice(0, 10))
    .lte("check_in", to.toISOString().slice(0, 10))
    .order("check_in");

  // Fetch member avatars for website bookings
  const memberIds = [
    ...new Set(
      (rows ?? [])
        .filter((r) => r.source === "website" && r.member_id)
        .map((r) => r.member_id as string),
    ),
  ];

  const memberMap = new Map<string, { full_name: string; avatar_url: string | null }>();
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from("members")
      .select("id, full_name, avatar_url")
      .in("id", memberIds);
    for (const m of members ?? []) {
      memberMap.set(m.id, { full_name: m.full_name, avatar_url: m.avatar_url });
    }
  }

  const reservations: CalendarReservation[] = (rows ?? []).map((r) => {
    const branch = Array.isArray(r.branch) ? r.branch[0] as { name: string } | undefined : r.branch as { name: string } | null;
    const member = r.member_id ? memberMap.get(r.member_id) : undefined;
    return {
      id: r.id,
      check_in: r.check_in,
      check_out: r.check_out,
      guest_name: r.guest_name,
      source: r.source,
      status: r.status,
      branch_name: branch?.name ?? undefined,
      member_avatar_url: member?.avatar_url ?? null,
      member_name: member?.full_name ?? null,
    };
  });

  return (
    <section className="container-edge py-12 max-w-5xl">
      <p className="terminal-label">/calendar</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        Booking calendar
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        All playcation reservations — website, Airbnb, and manual blocks.
      </p>

      <div className="mt-8">
        <ReservationCalendar reservations={reservations} showBranch />
      </div>
    </section>
  );
}
