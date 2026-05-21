import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getReservationById } from "@/lib/reservations";
import { formatRange, nightsBetween } from "@/lib/dates";
import { formatPHP } from "@/lib/utils";
import ConfirmedAnimation from "@/components/booking/ConfirmedAnimation";
import BookingConfirmedNotifier from "@/components/booking/BookingConfirmedNotifier";
import { Calendar, MapPin, Power, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking Confirmed",
};

export default async function ConfirmedPage({
  params,
}: {
  params: Promise<{ slug: string; reservationId: string }>;
}) {
  const { slug, reservationId } = await params;
  const reservation = await getReservationById(reservationId);
  if (!reservation) notFound();

  const branch =
    (reservation as { branch?: { slug: string; name: string; type: string; hero_image_url: string | null } | null }).branch ?? null;
  if (!branch || branch.slug !== slug) notFound();

  const nights = nightsBetween(reservation.check_in, reservation.check_out);
  const isConfirmed = reservation.status === "confirmed";

  return (
    <section className="relative min-h-[80vh] py-20 md:py-32 overflow-hidden">
      <BookingConfirmedNotifier
        reservationId={reservationId}
        branchId={(reservation as { branch_id?: string }).branch_id ?? ""}
        branchName={branch.name}
        checkIn={reservation.check_in}
        checkOut={reservation.check_out}
      />
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="container-edge relative">
        <div className="max-w-3xl mx-auto text-center">
          <ConfirmedAnimation />

          <p className="mt-10 terminal-label">// transmission complete</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.85] tracking-tight text-cream">
            {isConfirmed ? (
              <>
                BOOKING<br />
                <span className="text-amber text-glow-amber">CONFIRMED.</span>
              </>
            ) : (
              <>
                SLOT<br />
                <span className="text-amber text-glow-amber">RESERVED.</span>
              </>
            )}
          </h1>
          <p className="mt-6 text-lg text-cream-dim max-w-xl mx-auto">
            {isConfirmed
              ? "Your reservation is locked in. We'll have the controllers charged and the espresso ready."
              : "Your slot is held for 20 minutes while payment processes. We'll email you the moment it's confirmed."}
          </p>

          {/* Receipt-style monitor */}
          <div className="mt-12 monitor-frame text-left">
            <div className="monitor-screen p-6 md:p-8 space-y-4 font-mono text-sm">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-phosphor uppercase tracking-widest text-[0.65rem]">
                  // reservation_id
                </span>
                <span className="text-cream-dim text-[0.7rem] truncate ml-2">
                  {reservation.id}
                </span>
              </div>

              <Row icon={MapPin} label="branch" value={branch.name} />
              <Row
                icon={Calendar}
                label="dates"
                value={formatRange(reservation.check_in, reservation.check_out)}
              />
              <Row icon={Power} label="nights" value={String(nights)} />
              <Row icon={Users} label="guests" value={String(reservation.num_guests ?? 1)} />
              {(reservation as { guest_name?: string | null }).guest_name && (
                <Row icon={Users} label="name" value={(reservation as { guest_name: string }).guest_name} />
              )}
              {(reservation as { guest_email?: string | null }).guest_email && (
                <Row icon={MapPin} label="email" value={(reservation as { guest_email: string }).guest_email} />
              )}

              <div className="pt-4 mt-2 border-t border-line flex items-baseline justify-between">
                <span className="text-mocha uppercase tracking-widest text-[0.65rem]">
                  // total
                </span>
                <span className="text-3xl md:text-4xl font-display font-bold text-amber text-glow-amber">
                  {formatPHP(reservation.total_php ?? 0)}
                </span>
              </div>

              <div className="pt-4 border-t border-line">
                <span className="terminal-label">status</span>
                <p
                  className={`mt-2 text-lg font-bold ${
                    isConfirmed ? "text-phosphor text-glow-phosphor" : "text-amber"
                  }`}
                >
                  {isConfirmed ? "▶ CONFIRMED" : "◔ HOLD ACTIVE"}
                </p>
              </div>
            </div>
          </div>

          {(reservation as { guest_email?: string | null }).guest_email && (
            <p className="mt-6 font-mono text-sm text-cream-dim">
              // A confirmation email has been sent to{" "}
              <span className="text-amber">{(reservation as { guest_email: string }).guest_email}</span>
              . Check your inbox (and spam folder).
            </p>
          )}

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link href="/account" className="key-cap key-cap-primary">
              My bookings
            </Link>
            <Link href={`/branches/${branch.slug}`} className="key-cap">
              View branch
            </Link>
            <Link href="/playcation" className="key-cap">
              Browse other stays
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-mocha uppercase tracking-widest text-[0.65rem]">
        <Icon className="h-3 w-3 text-amber" />
        {label}
      </span>
      <span className="text-cream text-right">{value}</span>
    </div>
  );
}
