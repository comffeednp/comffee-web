import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getReservationById } from "@/lib/reservations";
import { getMemberOptional } from "@/lib/auth/require-member";
import { getAdminOptional } from "@/lib/auth/require-admin";
import { formatRange, nightsBetween } from "@/lib/dates";
import { formatPHP } from "@/lib/utils";
import ConfirmedAnimation from "@/components/booking/ConfirmedAnimation";
import BookingConfirmedNotifier from "@/components/booking/BookingConfirmedNotifier";
import ReservationStatusPoller from "@/components/booking/ReservationStatusPoller";
import { getPaymentLink, isPaymongoConfigured } from "@/lib/paymongo";
import { signChatSessionToken } from "@/lib/lookup-token";
import { Calendar, MapPin, Power, QrCode, Users } from "lucide-react";

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

  // This receipt shows the guest's name and email — only the member who owns the
  // booking (or an admin) may view it.
  const [member, admin] = await Promise.all([getMemberOptional(), getAdminOptional()]);
  const ownerId = (reservation as { member_id?: string | null }).member_id ?? null;
  const isOwner = !!member && !!ownerId && member.id === ownerId;
  if (!isOwner && !admin) notFound();

  const nights = nightsBetween(reservation.check_in, reservation.check_out);
  const isConfirmed = reservation.status === "confirmed";
  // Request-to-book: after payment the booking WAITS for the owner. Don't tell
  // the guest they're "confirmed" until the host actually accepts.
  const isPendingApproval = reservation.status === "pending_approval";
  // Still a hold = the guest hasn't paid yet. The old flow could strand them here
  // with no QR. Fetch the PayMongo hosted-checkout URL (which renders the QR Ph
  // code) so we can ALWAYS show a "Complete payment" button. Best-effort: if
  // PayMongo is unreachable, the receipt + status poller below still work.
  const isHold = !isConfirmed && !isPendingApproval;
  const paymongoIntentId =
    (reservation as { paymongo_intent_id?: string | null }).paymongo_intent_id ?? null;
  let resumeCheckoutUrl: string | null = null;
  if (isHold && paymongoIntentId && isPaymongoConfigured()) {
    try {
      const link = (await getPaymentLink(paymongoIntentId)) as {
        data?: { attributes?: { checkout_url?: string } };
      };
      resumeCheckoutUrl = link?.data?.attributes?.checkout_url ?? null;
    } catch {
      /* PayMongo unreachable — poller + account links still give a path forward */
    }
  }

  const r = reservation as {
    payment_type?: string | null;
    balance_php?: number | null;
    balance_due_date?: string | null;
    balance_paid_at?: string | null;
  };
  const balancePhp = Number(r.balance_php ?? 0);
  const isPartialWithBalance =
    r.payment_type === "partial" && balancePhp > 0 && !r.balance_paid_at;
  const balanceDueDate = r.balance_due_date
    ? new Date(r.balance_due_date + "T00:00:00").toLocaleDateString("en-PH", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <section className="relative min-h-[80vh] py-20 md:py-32 overflow-hidden">
      {/* Only when ACTUALLY confirmed — the notifier posts "✓ Booking confirmed!"
          into chat, which must never fire for an unpaid hold or a booking still
          waiting on owner approval. */}
      {isConfirmed && (
        <BookingConfirmedNotifier
          reservationId={reservationId}
          branchId={(reservation as { branch_id?: string }).branch_id ?? ""}
          branchName={branch.name}
          checkIn={reservation.check_in}
          checkOut={reservation.check_out}
          sessionToken={signChatSessionToken(reservationId)}
        />
      )}
      <ReservationStatusPoller reservationId={reservationId} initialStatus={reservation.status} />
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
            ) : isPendingApproval ? (
              <>
                REQUEST<br />
                <span className="text-amber text-glow-amber">SENT.</span>
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
              : isPendingApproval
              ? "Payment received and your dates are held. The host reviews each booking — you'll get a confirmation the moment it's approved, or a full refund if it can't be accepted."
              : "Your slot is held for 20 minutes. Pay now via QR Ph (GCash, Maya, or any bank) and your booking confirms the moment payment lands."}
          </p>

          {isHold && (
            <div className="mt-10">
              {resumeCheckoutUrl ? (
                <>
                  <a
                    href={resumeCheckoutUrl}
                    className="key-cap key-cap-primary !px-8 !py-4 text-base"
                    title="Open the secure payment page with your QR Ph code"
                  >
                    <QrCode className="h-5 w-5" />
                    Complete payment
                  </a>
                  <p className="mt-3 font-mono text-xs text-cream-dim">
                    // Opens the secure PayMongo page with your QR Ph code. This page updates on its own once payment lands.
                  </p>
                </>
              ) : (
                <p className="font-mono text-sm text-amber">
                  // Preparing your payment link — refresh in a moment, or open this booking from{" "}
                  <Link href="/account" className="underline">your account</Link> to pay.
                </p>
              )}
            </div>
          )}

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
                  {isPartialWithBalance ? "// paid now" : "// total"}
                </span>
                <span className="text-3xl md:text-4xl font-display font-bold text-amber text-glow-amber">
                  {formatPHP(reservation.total_php ?? 0)}
                </span>
              </div>

              {isPartialWithBalance && (
                <div className="mt-3 rounded-lg border border-amber/40 bg-amber/5 p-3 text-left">
                  <div className="flex items-baseline justify-between">
                    <span className="text-amber uppercase tracking-widest text-[0.65rem]">
                      // balance due{balanceDueDate ? ` · ${balanceDueDate}` : ""}
                    </span>
                    <span className="text-lg font-display font-bold text-amber">
                      {formatPHP(balancePhp)}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.7rem] leading-relaxed text-cream-dim">
                    You paid the 30% reservation fee + deposit. Settle the remaining balance from{" "}
                    <Link href="/account" className="text-amber hover:underline">your account</Link>{" "}
                    before the due date, or the reservation is auto-cancelled and the fee + deposit are forfeited.
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-line">
                <span className="terminal-label">status</span>
                <p
                  className={`mt-2 text-lg font-bold ${
                    isConfirmed ? "text-phosphor text-glow-phosphor" : "text-amber"
                  }`}
                >
                  {isConfirmed
                    ? "▶ CONFIRMED"
                    : isPendingApproval
                    ? "◔ AWAITING HOST APPROVAL"
                    : "◔ HOLD ACTIVE"}
                </p>
              </div>
            </div>
          </div>

          {(reservation as { guest_email?: string | null }).guest_email && (
            <p className="mt-6 font-mono text-sm text-cream-dim">
              {isConfirmed
                ? "// A confirmation email has been sent to "
                : isPendingApproval
                ? "// We've emailed your request details to "
                : "// A receipt has been sent to "}
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
