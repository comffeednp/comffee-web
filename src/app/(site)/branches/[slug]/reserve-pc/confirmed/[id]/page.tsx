import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PaymentClient from "./PaymentClient";
import { ArrowLeft, MapPin } from "lucide-react";

// Stage 7a: customer-facing payment-instructions page. The flow is now-only — by the time the
// customer sees this, a PC is held in their name for 5 minutes (payment_hold_expires_at).
// They scan the partner's GCash QR + send the exact amount + press "I paid" → the partner's POS
// verifies via existing OCR matching. If 5 min passes without claim_paid, the row stays at
// status='pending', payment_status='unpaid', past expiry — POS-side sweep will mark it expired.
// [[comffee-saas-vision]] Stage 7a.

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Pay to confirm — ${slug}`, robots: { index: false } };
}

export default async function ConfirmedPCReservationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const admin = getSupabaseAdmin();

  // Fetch reservation + branch in parallel. We use the admin client because this page renders
  // sensitive payment instructions tied to one reservation — we authorize by reservation ID
  // (the customer holds the URL after creating); the URL is hard to guess (UUID) and short-lived
  // (5 min payment + 30 min arrival).
  const { data: r } = await admin
    .from("pc_reservations")
    .select(
      "id, branch_id, station_name, customer_name, customer_phone, total_php, status, payment_status, payment_hold_expires_at, reserved_for_start, must_honor_by, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const { data: branch } = await admin
    .from("branches")
    .select("id, slug, name, type, gcash_qr_url, gcash_type, address, city")
    .eq("id", r.branch_id)
    .maybeSingle();
  if (!branch || branch.slug !== slug) notFound();

  // Auto-expire on read: if the payment window passed and the customer hasn't pressed "I paid",
  // flip status to 'expired' so the station is released. A separate POS-side sweep also handles
  // this in case nobody reloads the page (Stage 7b).
  const nowMs = Date.now();
  const holdMs = r.payment_hold_expires_at ? new Date(r.payment_hold_expires_at).getTime() : null;
  let effectivePaymentStatus = r.payment_status as string;
  let effectiveStatus = r.status as string;
  if (
    holdMs &&
    holdMs < nowMs &&
    effectivePaymentStatus === "unpaid" &&
    effectiveStatus === "pending"
  ) {
    await admin
      .from("pc_reservations")
      .update({ status: "expired", cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .eq("payment_status", "unpaid");
    effectiveStatus = "expired";
  }

  const expired = effectiveStatus === "expired" || effectiveStatus === "cancelled";
  const verified = effectivePaymentStatus === "verified";
  const claimed = effectivePaymentStatus === "claim_paid";

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          <Link
            href={`/branches/${branch.slug}`}
            title="Back to branch page"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to {branch.name}
          </Link>
          <div className="mt-6 max-w-3xl">
            <p className="terminal-label">/reserve-pc/confirmed</p>
            <h1 className="mt-3 font-display text-4xl md:text-5xl font-bold leading-[0.95] tracking-tight text-cream">
              {expired
                ? "Reservation expired."
                : verified
                  ? "Payment verified — see you soon."
                  : claimed
                    ? "Got it — waiting on the cafe to verify."
                    : "Pay to confirm."}
            </h1>
            <p className="mt-3 text-cream-dim text-lg">
              {expired ? (
                <>This 5-minute hold ended without payment. The station is back in the live vacant list — feel free to start over.</>
              ) : verified ? (
                <>You're good. Walk in within 30 minutes; the cafe is expecting you.</>
              ) : claimed ? (
                <>The cafe will spot your GCash receipt and lock in your station within a few seconds.</>
              ) : (
                <>Scan the GCash QR below and send <strong className="text-amber">₱{Number(r.total_php ?? 0).toFixed(2)}</strong>. Then tap <strong>I paid</strong>.</>
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-cream-dim font-mono">
              <span>Station <strong className="text-cream">{r.station_name}</strong></span>
              <span>·</span>
              <span>{r.customer_name}</span>
              {branch.address && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {branch.address}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16 max-w-3xl">
        <PaymentClient
          reservationId={r.id}
          branchSlug={branch.slug}
          totalPhp={Number(r.total_php ?? 0)}
          gcashQrUrl={branch.gcash_qr_url}
          gcashType={branch.gcash_type}
          paymentHoldExpiresAt={r.payment_hold_expires_at}
          initialPaymentStatus={effectivePaymentStatus}
          initialStatus={effectiveStatus}
        />
      </section>
    </>
  );
}
