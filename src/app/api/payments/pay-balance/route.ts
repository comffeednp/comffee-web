import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMemberOptional } from "@/lib/auth/require-member";
import { guardMutating } from "@/lib/security";
import { createPaymentLink, getPaymentLink, isPaymongoConfigured } from "@/lib/paymongo";
import {
  attachBalanceIntent,
  getReservationById,
  markBalancePaid,
} from "@/lib/reservations";
import { sendBalancePaidReceipt } from "@/lib/email";

export const runtime = "nodejs";

const schema = z.object({ reservationId: z.string().uuid() });

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "pay-balance",
    limit: 10,
    windowMs: 10 * 60 * 1000,
    maxBytes: 2 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  // Must be the signed-in member who owns this booking.
  const member = await getMemberOptional();
  if (!member) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const reservation = await getReservationById(parsed.data.reservationId);
  if (!reservation || reservation.member_id !== member.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Only a confirmed, partial booking with an unpaid balance can be settled.
  const balancePhp = Number(reservation.balance_php ?? 0);
  if (
    reservation.status !== "confirmed" ||
    reservation.payment_type !== "partial" ||
    balancePhp <= 0 ||
    reservation.balance_paid_at
  ) {
    return NextResponse.json({ error: "no_balance_due" }, { status: 400 });
  }

  const branch = reservation.branch as { slug?: string; name?: string } | null;
  const branchName = branch?.name ?? "Comffee Playcation";
  const branchSlug = branch?.slug ?? "";

  // Dev mode — no PayMongo. Mark paid immediately so the flow is testable.
  if (!isPaymongoConfigured()) {
    await markBalancePaid(reservation.id);
    if (reservation.guest_email) {
      sendBalancePaidReceipt({
        to: reservation.guest_email,
        guestName: reservation.guest_name ?? "there",
        branchName,
        checkIn: reservation.check_in,
        checkOut: reservation.check_out,
        balancePhp,
        reservationId: reservation.id,
      }).catch((e) => console.error("[email] balance receipt failed", e));
    }
    revalidatePath("/account");
    return NextResponse.json({ ok: true, simulated: true });
  }

  // If a balance link already exists for this booking, reuse it instead of
  // creating a second one. We only store the newest link id, so a payment made
  // on an older link would not be matched by the webhook — reusing avoids that.
  if (reservation.balance_paymongo_intent_id) {
    try {
      const existing = (await getPaymentLink(reservation.balance_paymongo_intent_id)) as {
        data?: { attributes?: { checkout_url?: string; status?: string } };
      };
      const url = existing.data?.attributes?.checkout_url;
      const status = existing.data?.attributes?.status;
      if (url && status !== "paid") {
        return NextResponse.json({ ok: true, checkoutUrl: url, reused: true });
      }
    } catch {
      // Couldn't fetch the old link — fall through and create a fresh one.
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "https://comffee.org";
  try {
    const link = await createPaymentLink({
      amountPhp: balancePhp,
      description: `Comffee Playcation · ${branchName} · remaining balance`,
      remarks: `reservation-balance:${reservation.id}`,
      redirectUrl: `${siteUrl}/playcation/${branchSlug}/confirmed/${reservation.id}`,
    });
    await attachBalanceIntent(reservation.id, link.id);
    return NextResponse.json({ ok: true, checkoutUrl: link.checkout_url });
  } catch (e) {
    console.error("pay-balance paymongo error", e);
    return NextResponse.json(
      { error: "payment_link_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
