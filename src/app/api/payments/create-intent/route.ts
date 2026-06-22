import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  attachPaymentIntent,
  computePlaycationTotal,
  confirmReservation,
  createHold,
} from "@/lib/reservations";
import { addDays, nightsBetween } from "@/lib/dates";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMemberOptional } from "@/lib/auth/require-member";
import {
  createPaymentLink,
  isPaymongoConfigured,
} from "@/lib/paymongo";
import { recordRedemption, validatePromoCode } from "@/lib/promo-codes";
import { guardMutating } from "@/lib/security";
import { sendBookingConfirmation } from "@/lib/email";
import { listInstructionPhotos } from "@/lib/branch-instructions";

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
    .select("id, slug, name, type, security_deposit_php")
    .eq("id", v.branchId)
    .maybeSingle();
  if (!branch || branch.type !== "playcation") {
    return NextResponse.json({ error: "branch_not_bookable" }, { status: 400 });
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

  // Partial: charge 30% of accommodation + deposit now; balance 70% due 3 days before check-in
  const reservationFee = v.paymentType === "partial"
    ? Math.ceil(accommodationTotal * 0.30)
    : accommodationTotal;
  const balancePhp = v.paymentType === "partial" ? accommodationTotal - reservationFee : 0;
  const balanceDueDate = v.paymentType === "partial"
    ? new Date(new Date(v.checkIn).getTime() - 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : undefined;

  // Partial payment only makes sense if the balance due date is far enough out
  // to collect it. Mirror the client's gate so a crafted request can't create a
  // partial booking whose balance is already due (or overdue).
  if (v.paymentType === "partial") {
    const phToday = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    if (!balanceDueDate || balanceDueDate <= addDays(phToday, 1)) {
      return NextResponse.json({ error: "partial_not_allowed_close_checkin" }, { status: 400 });
    }
  }

  const total = reservationFee + SECURITY_DEPOSIT_PHP + PROCESSING_FEE_PHP;

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

  // Dev mode — no PayMongo configured. Simulate instant confirm + email.
  if (!isPaymongoConfigured()) {
    try {
      await confirmReservation(hold.id);
    } catch (e) {
      console.error("simulated confirm failed", e);
    }
    if (v.guestEmail) {
      const instructionPhotos = (await listInstructionPhotos(branch.id)).map((p) => ({
        label: p.label,
        url: p.signedUrl,
      }));
      sendBookingConfirmation({
        to: v.guestEmail,
        guestName: v.guestName,
        branchName: branch.name,
        branchSlug: branch.slug,
        checkIn: v.checkIn,
        checkOut: v.checkOut,
        numGuests: v.numGuests,
        totalPhp: total,
        balancePhp: v.paymentType === "partial" ? balancePhp : 0,
        balanceDueDate: v.paymentType === "partial" ? (balanceDueDate ?? null) : null,
        reservationId: hold.id,
        instructionPhotos,
      }).catch((e) => console.error("[email] booking failed", e));
    }
    return NextResponse.json({
      ok: true,
      simulated: true,
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
