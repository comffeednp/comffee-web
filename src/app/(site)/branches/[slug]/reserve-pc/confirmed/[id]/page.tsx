import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PaymentClient from "./PaymentClient";
import { ArrowLeft, MapPin } from "lucide-react";

// PayMongo hosted-checkout reservation confirm page (2026-06-01). PayMongo's success_url returns the
// customer here after they pay. The live state — unpaid (waiting for the webhook) / paid (show the
// code) / expired — is driven entirely by PaymentClient polling /pay-status; this server wrapper just
// authorizes by reservation id (unguessable UUID, short-lived) and renders the shell.

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Reserve a PC — ${slug}`, robots: { index: false } };
}

export default async function ConfirmedPCReservationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const admin = getSupabaseAdmin();

  const { data: r } = await admin
    .from("pc_reservations")
    .select("id, branch_id, station_name, customer_name, total_php, status, payment_status")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const { data: branch } = await admin
    .from("branches")
    .select("id, slug, name, address")
    .eq("id", r.branch_id)
    .maybeSingle();
  if (!branch || branch.slug !== slug) notFound();

  const ps = r.payment_status as string;
  const isExpired = ps === "expired" || r.status === "expired" || r.status === "cancelled";
  const title = ps === "paid" ? "Reserved!" : isExpired ? "Reservation expired" : "Confirming payment.";
  const subtitle =
    ps === "paid"
      ? "You're all set — your code is below."
      : isExpired
        ? "The booking was released. Start over if you still want a PC."
        : "We're confirming your payment — this page updates on its own once it lands.";

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
              {title}
            </h1>
            <p className="mt-3 text-cream-dim text-lg">{subtitle}</p>
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
          stationName={r.station_name as string}
          initialPaymentStatus={ps}
        />
      </section>
    </>
  );
}
