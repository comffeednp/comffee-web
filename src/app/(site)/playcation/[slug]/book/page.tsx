import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getBranchBySlug } from "@/lib/branches";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth/require-member";
import { addDays, findEarliestAvailable } from "@/lib/dates";
import BookingClient from "@/components/booking/BookingClient";
import { isSumsubConfigured } from "@/lib/sumsub";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  return {
    title: branch ? `Book ${branch.name}` : "Book",
    description: branch?.tagline ?? undefined,
  };
}

export default async function BookPlaycationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string }>;
}) {
  const { slug } = await params;
  const { checkIn: qCheckIn, checkOut: qCheckOut } = await searchParams;
  const branch = await getBranchBySlug(slug);
  if (!branch || branch.type !== "playcation") notFound();

  // Philippines time (UTC+8) — server runs UTC, so shift manually
  const nowPH = new Date(Date.now() + 8 * 3600 * 1000);
  const todayPH = nowPH.toISOString().slice(0, 10);

  // Pull blocked dates within the next 6 months for the picker.
  const horizon = addDays(todayPH, 180);
  const supabase = getSupabaseAdmin();
  const { data: blocked } = await supabase
    .from("reservations")
    .select("check_in, check_out, source, status, hold_expires_at")
    .eq("branch_id", branch.id)
    .in("status", ["pending_hold", "confirmed"])
    .lt("check_in", horizon)
    .gt("check_out", todayPH);

  const nowMs = Date.now();
  const initialBlocked = (blocked ?? [])
    .filter((b) => {
      if (b.status === "pending_hold" && b.hold_expires_at) {
        return new Date(b.hold_expires_at).getTime() > nowMs;
      }
      return true;
    })
    .map((b) => ({
      check_in: b.check_in,
      check_out: b.check_out,
      source: b.source,
    }));

  // Earliest bookable date: today if before the branch cutoff, else tomorrow
  const cutoff = branch.booking_cutoff_time; // "HH:MM:SS" or null
  let minDate: string;
  if (cutoff) {
    const [ch, cm] = cutoff.split(":").map(Number);
    const phMinutes = nowPH.getUTCHours() * 60 + nowPH.getUTCMinutes();
    const cutoffMinutes = (ch ?? 22) * 60 + (cm ?? 0);
    minDate = phMinutes >= cutoffMinutes ? addDays(todayPH, 1) : todayPH;
  } else {
    minDate = addDays(todayPH, 1);
  }
  const earliestCheckIn = findEarliestAvailable(initialBlocked, minDate);
  const defaultCheckIn = qCheckIn ?? earliestCheckIn;
  const defaultCheckOut = qCheckOut ?? addDays(defaultCheckIn, 1);

  // Compute the base nightly rate from branch_rates (first 'night' unit, fallback to first rate).
  const nightlyRateRow =
    branch.rates.find((r) => r.unit === "night") ?? branch.rates[0] ?? null;
  const nightlyRate = nightlyRateRow?.price_php ?? 0;
  const maxPax = nightlyRateRow?.max_pax ?? null;
  const extraPaxFee = nightlyRateRow?.extra_pax_fee_php ?? null;

  // Require sign-in — redirects to /account/login?next=... if not authenticated
  const member = await requireMember(`/playcation/${slug}/book`);
  const kycVerified = member.kyc_status === "approved";
  const memberId = member.id;

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          <Link
            href={`/branches/${branch.slug}`}
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to {branch.name}
          </Link>
          <div className="mt-6">
            <p className="terminal-label">/playcation/{branch.slug}/book</p>
            <h1 className="mt-3 font-display text-4xl md:text-6xl font-bold leading-[0.95] tracking-tight text-cream">
              Reserve your stay.
            </h1>
            <p className="mt-3 text-cream-dim text-lg max-w-2xl">
              Three steps. Live availability. Twenty-minute hold while you check out.
            </p>
          </div>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16">
        <BookingClient
          branch={{
            id: branch.id,
            slug: branch.slug,
            name: branch.name,
            city: branch.city,
            hero_image_url: branch.hero_image_url,
            baseNightlyRate: Number(nightlyRate),
            maxPax: maxPax,
            extraPaxFeePhp: extraPaxFee ? Number(extraPaxFee) : null,
            maxGuests: branch.max_guests ?? null,
            securityDepositPhp: branch.security_deposit_php != null ? Number(branch.security_deposit_php) : 1000,
          }}
          initialBlocked={initialBlocked}
          kycEnabled={isSumsubConfigured()}
          kycVerified={kycVerified}
          memberId={memberId}
          initialCheckIn={defaultCheckIn}
          initialCheckOut={defaultCheckOut}
        />
      </section>
    </>
  );
}
