import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  attachPaymentIntent,
  computePlaycationTotal,
  confirmPaidReservation,
  createHold,
} from "@/lib/reservations";
import { nightsBetween } from "@/lib/dates";
import { computeReservationCharge } from "@/lib/booking-pricing";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMemberOptional } from "@/lib/auth/require-member";
import {
  createPaymentLink,
  isPaymongoConfigured,
} from "@/lib/paymongo";
import { recordRedemption, validatePromoCode } from "@/lib/promo-codes";
import { guardMutating } from "@/lib/security";

export const runtime = "nodejs";

const PROCESSING_FEE_PHP = Number(process.env.NEXT_PUBLIC_PROCESSING_FEE_PHP ?? "150");

const schema = z.object({
  branchId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  numGuests: z.number().int().min(1).max(20),
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestPhone: z.string().max(40).optional().or(z.literal("")),
  promoCode: z.string().max(40).optional().or(z.literal("")),
  paymentType: z.enum(["full", "partial"]).default("full"),
  // memberId is intentionally NOT read from the body — it's taken from the
  // signed-in session below so a caller can't book under someone else's account.
  // ID-verification documents are required; the booking can't be created without them.
  kycSelfieUrl: z.string().min(1).max(500),
  kycIdUrl: z.string().min(1).max(500),
  kycBillingUrl: z.string().min(1).max(500),
  kycIpAddress: z.string().max(60).optional().nullable(),
  kycLatitude: z.number().optional().nullable(),
  kycLongitude: z.number().optional().nullable(),
});

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "payments-create-intent",
    limit: 10,
    windowMs: 10 * 60 * 1000,
    maxBytes: 8 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const v = parsed.data;

  // Booking requires a signed-in member. We trust the session, not the request
  // body, for who is booking.
  const member = await getMemberOptional();
  if (!member) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const nights = nightsBetween(v.checkIn, v.checkOut);
  if (nights < 1) {
    return NextResponse.json({ error: "min_one_night" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: branch } = await supabase
    .from("branches")
    .select("id, slug, name, type, security_deposit_php, booking_cutoff_time")
    .eq("id", v.branchId)
    .maybeSingle();
  if (!branch || branch.type !== "playcation") {
    return NextResponse.json({ error: "branch_not_bookable" }, { status: 400 });
  }

  // Server-side booking cutoff (owner 2026-05-29). A branch can auto-block SAME-DAY check-ins after a
  // cutoff time (Anonas = 22:00 / 10 PM). The booking page applies this client-side to set the earliest
  // selectable date, but a stale/crafted request could still POST a "today" check-in past the cutoff —
  // which then shows up as a booking it shouldn't. Enforce it on the server too. PH is UTC+8 all year
  // (no DST). Branches with no cutoff set (NULL) are unrestricted.
  const cutoff = (branch as { booking_cutoff_time?: string | null }).booking_cutoff_time;
  if (cutoff) {
    const [ch, cm] = String(cutoff).split(":").map(Number);
    const cutoffMin = (Number.isFinite(ch) ? ch : 22) * 60 + (Number.isFinite(cm) ? cm : 0);
    const nowPH = new Date(Date.now() + 8 * 3600 * 1000);
    const todayPH = nowPH.toISOString().slice(0, 10);
    if (v.checkIn === todayPH) {
      const nowMin = nowPH.getUTCHours() * 60 + nowPH.getUTCMinutes();
      if (nowMin >= cutoffMin) {
        return NextResponse.json(
          { error: "checkin_past_cutoff", detail: `Bookings for today close at ${cutoff}. The earliest check-in is tomorrow.` },
          { status: 400 },
        );
      }
    }
  }
  const SECURITY_DEPOSIT_PHP = (branch as { security_deposit_php?: number | null }).security_deposit_php != null
    ? Number((branch as { security_deposit_php: number }).security_deposit_php)
    : 1000;

  const subtotal = await computePlaycationTotal(v.branchId, nights, v.numGuests);
  if (subtotal <= 0) {
    return NextResponse.json({ error: "no_rate_set" }, { status: 400 });
  }

  // Apply promo if any
  let discount = 0;
  let promoCodeId: string | null = null;
  if (v.promoCode) {
    try {
      const result = await validatePromoCode(v.promoCode, subtotal, "reservation");
      discount = result.discountPhp;
      promoCodeId = result.promoCode.id;
    } catch (e) {
      return NextResponse.json(
        { error: "promo_invalid", detail: e instanceof Error ? e.message : "unknown" },
        { status: 400 },
      );
    }
  }

  const accommodationTotal = Math.max(0, subtotal - discount);

  // Pricing comes from the shared booking-pricing module so the amount we charge
  // can never drift from what the booking UI displayed (30% split, balance due
  // date, deposit + fee). `total` here is the amount charged NOW (= dueNow).
  const charge = computeReservationCharge({
    accommodationTotal,
    paymentType: v.paymentType,
    securityDepositPhp: SECURITY_DEPOSIT_PHP,
    processingFeePhp: PROCESSING_FEE_PHP,
    checkIn: v.checkIn,
    nowMs: Date.now(),
  });

  // A crafted request can't create a partial booking whose balance is already
  // due (or too close to collect) — reject it using the same gate as the UI.
  if (v.paymentType === "partial" && !charge.partialAllowed) {
    return NextResponse.json({ error: "partial_not_allowed_close_checkin" }, { status: 400 });
  }

  const { reservationFee, balancePhp } = charge;
  const balanceDueDate = charge.balanceDueDate ?? undefined;
  const total = charge.dueNow;

  // Soft-hold (will throw with CONFLICT message if dates collide)
  let hold;
  try {
    hold = await createHold({
      branchId: v.branchId,
      checkIn: v.checkIn,
      checkOut: v.checkOut,
      guestName: v.guestName,
      guestEmail: v.guestEmail || undefined,
      guestPhone: v.guestPhone || undefined,
      numGuests: v.numGuests,
      totalPhp: total,
      securityDepositPhp: SECURITY_DEPOSIT_PHP,
      paymentType: v.paymentType,
      balancePhp,
      balanceDueDate,
      memberId: member.id,
      kycSelfieUrl: v.kycSelfieUrl || undefined,
      kycIdUrl: v.kycIdUrl || undefined,
      kycBillingUrl: v.kycBillingUrl || undefined,
      kycIpAddress: v.kycIpAddress || undefined,
      kycLatitude: v.kycLatitude ?? undefined,
      kycLongitude: v.kycLongitude ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "hold_failed";
    const isConflict = msg.startsWith("CONFLICT");
    if (isConflict) {
      // If the blocking hold is the member's OWN still-active one (they bailed
      // from checkout and re-submitted the same dates), hand it back so the
      // client can resume payment instead of dead-ending with "dates taken".
      try {
        const { data: own } = await supabase
          .from("reservations")
          .select("id")
          .eq("branch_id", v.branchId)
          .eq("member_id", member.id)
          .eq("status", "pending_hold")
          .lt("check_in", v.checkOut)
          .gt("check_out", v.checkIn)
          .gt("hold_expires_at", new Date().toISOString())
          .order("hold_expires_at", { ascending: false })
          .limit(1);
        const ownHold = own?.[0];
        if (ownHold) {
          return NextResponse.json(
            { error: "dates_taken", resumeReservationId: ownHold.id },
            { status: 409 },
          );
        }
      } catch {
        /* fall through to the generic conflict response */
      }
    }
    return NextResponse.json(
      { error: isConflict ? "dates_taken" : msg },
      { status: isConflict ? 409 : 500 },
    );
  }

  // Persist promo on the reservation row
  if (discount > 0 && promoCodeId) {
    await supabase
      .from("reservations")
      .update({ discount_php: discount, promo_code_id: promoCodeId })
      .eq("id", hold.id);
    await recordRedemption({
      promoCodeId,
      discountPhp: discount,
      reservationId: hold.id,
    });
  }

  // Purge the branch page cache so availability calendar updates immediately
  revalidatePath(`/branches/${branch.slug}`);

  // Dev mode — no PayMongo configured. Mirror production: a "paid" playcation booking
  // INSTANT-confirms (no host approval — owner 2026-06-15) and sends the confirmation email.
  if (!isPaymongoConfigured()) {
    try {
      await confirmPaidReservation(hold.id);
    } catch (e) {
      console.error("simulated confirmPaidReservation failed", e);
    }
    return NextResponse.json({
      ok: true,
      simulated: true,
      pendingApproval: true,
      reservationId: hold.id,
      total,
      accommodationTotal,
      securityDeposit: SECURITY_DEPOSIT_PHP,
      discount,
    });
  }

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")
      ? process.env.NEXT_PUBLIC_SITE_URL
      : "https://comffee.org";
    const link = await createPaymentLink({
      amountPhp: total,
      description: v.paymentType === "partial"
        ? `Comffee Playcation · ${branch.name} · 30% reservation fee + ₱${SECURITY_DEPOSIT_PHP.toLocaleString()} deposit (balance ₱${balancePhp.toLocaleString()} due ${balanceDueDate})`
        : `Comffee Playcation · ${branch.name} · ${nights} night${nights === 1 ? "" : "s"} + ₱${SECURITY_DEPOSIT_PHP.toLocaleString()} refundable deposit`,
      remarks: `reservation:${hold.id}`,
      redirectUrl: `${siteUrl}/playcation/${branch.slug}/confirmed/${hold.id}`,
    });
    await attachPaymentIntent(hold.id, link.id);
    return NextResponse.json({
      ok: true,
      reservationId: hold.id,
      checkoutUrl: link.checkout_url,
      linkId: link.id,
      discount,
    });
  } catch (e) {
    console.error("paymongo error", e);
    await supabase.from("reservations").delete().eq("id", hold.id);
    return NextResponse.json(
      { error: "payment_link_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
