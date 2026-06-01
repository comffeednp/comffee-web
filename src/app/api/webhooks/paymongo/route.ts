import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  cancelReservation,
  confirmReservation,
  getReservationByBalanceIntent,
  getReservationByIntent,
  markBalancePaid,
} from "@/lib/reservations";
import {
  getOrderById,
  getOrderByIntent,
  markOrderFailed,
  markOrderPaid,
} from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/paymongo";
import { sendBalancePaidReceipt, sendBookingConfirmation, sendOrderConfirmation } from "@/lib/email";
import { listInstructionPhotos } from "@/lib/branch-instructions";

export const runtime = "nodejs";

interface WebhookPayload {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      data?: {
        id?: string;
        type?: string;
        attributes?: {
          payments?: Array<{ data?: { id?: string } }>;
          payment_id?: string;
          amount?: number;
          // On a payment.paid event the inner object IS the payment; it carries the Payment Intent id.
          // This is the reliable key for a cafe PC booking (we store pi_ on the reservation).
          payment_intent_id?: string;
        };
      };
    };
  };
}

/**
 * PayMongo webhook handler — handles Playcation reservations + balance + orders + top-ups +
 * refunds (verified with the platform env secret), AND per-branch cafe PC reservations (verified
 * with the BRANCH's own webhook secret).
 *
 *  - Verifies HMAC signature (constant-time compare)
 *  - Idempotent via paymongo_webhook_events unique constraint
 *  - On payment.paid: captures the payment.id, marks the parent row paid,
 *    and fires the customer confirmation email (where applicable)
 *  - On refund events: marks the corresponding refund row succeeded
 *
 * SIGNATURE VERIFICATION — two secrets:
 * The original flows all sign with the single platform env secret PAYMONGO_WEBHOOK_SECRET. Cafe
 * PC reservations are paid into the OWNER's PayMongo account, so PayMongo signs THOSE webhooks with
 * the owner's webhook secret (stored per-branch in branch_payment_config). We therefore try the env
 * secret FIRST (covers every existing flow, unchanged); only if that fails do we look up the cafe
 * reservation this event refers to (by the Payment Link id), fetch its branch's webhook secret, and
 * try that. This keeps the existing path byte-for-byte identical and adds the per-branch path as a
 * pure fallback. We must parse the body BEFORE verifying because the per-branch secret lookup needs
 * the Payment Link id from the payload — parsing untrusted JSON is safe; we just don't ACT on it
 * until a signature check passes.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("paymongo-signature");
  const envSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventId = payload.data?.id;
  const eventType = payload.data?.attributes?.type;
  const inner = payload.data?.attributes?.data;
  const linkOrPaymentId = inner?.id;
  // The Payment Intent id (pi_) carried on a payment.paid event. THIS is how a cafe PC booking is
  // matched — we store the pi_ on the reservation at checkout-create time (the cs_/pay_ ids don't
  // match what the webhook carries). Proven 2026-06-01.
  const paymentIntentId = inner?.attributes?.payment_intent_id ?? null;

  if (!eventId) {
    return NextResponse.json({ error: "no_event_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1) Try the platform env secret (covers all existing flows — unchanged behaviour).
  let verified = verifyWebhookSignature(rawBody, signature, envSecret);

  // 2) Fallback for per-branch cafe reservations: find the reservation this event refers to (by the
  //    id PayMongo puts at data.attributes.data.id), fetch its branch's webhook secret, and verify
  //    against that. Only runs when the env secret didn't match, so it never weakens the existing path.
  //    ⚠ VERIFY ON THE CARD-BLOCK LIVE TEST: for 'checkout_session.payment.paid' we ASSUME inner.id is
  //    the cs_ id we stored in paymongo_intent_id (the natural Checkout-Session event shape). If PayMongo
  //    instead puts a payment id there, this lookup misses → branch secret never tried → signature 401
  //    → the booking would never confirm (the silent-money-failure to watch for). The live test settles
  //    it; if it differs, also match by the cs_ id carried elsewhere in the payload.
  let cafeReservationId: string | null = null;
  if (!verified && (paymentIntentId || linkOrPaymentId)) {
    // Match a cafe booking by the pi_ FIRST (what payment.paid carries), then fall back to the cs_/link
    // id (covers any other shape). This is what lets us reach the branch's webhook secret to verify.
    let pcr: { id: string; branch_id: string } | null = null;
    if (paymentIntentId) {
      const { data } = await supabase
        .from("pc_reservations")
        .select("id, branch_id")
        .eq("paymongo_payment_intent_id", paymentIntentId)
        .maybeSingle();
      pcr = (data as { id: string; branch_id: string } | null) ?? null;
    }
    if (!pcr && linkOrPaymentId) {
      const { data } = await supabase
        .from("pc_reservations")
        .select("id, branch_id")
        .eq("paymongo_intent_id", linkOrPaymentId)
        .maybeSingle();
      pcr = (data as { id: string; branch_id: string } | null) ?? null;
    }
    if (pcr) {
      cafeReservationId = pcr.id as string;
      const { data: cfg } = await supabase
        .from("branch_payment_config")
        .select("paymongo_webhook_secret")
        .eq("branch_id", pcr.branch_id)
        .maybeSingle();
      const branchSecret = (cfg as { paymongo_webhook_secret?: string | null } | null)
        ?.paymongo_webhook_secret;
      if (branchSecret) {
        verified = verifyWebhookSignature(rawBody, signature, branchSecret);
      }
    }
  }

  if (!verified) {
    console.error("paymongo webhook: bad signature");
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  // Idempotency check
  const { error: insertErr } = await supabase
    .from("paymongo_webhook_events")
    .insert({ paymongo_event_id: eventId, payload });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("paymongo webhook: failed to record event", insertErr.message);
  }

  if (!linkOrPaymentId) {
    return NextResponse.json({ ok: true, ignored: "no_inner_id" });
  }

  // Refund events ----------------------------------------------------------
  if (eventType === "refund.succeeded" || eventType === "refund.updated") {
    const updateData: Record<string, unknown> = {};
    if (eventType === "refund.succeeded") {
      updateData.status = "succeeded";
      updateData.refunded_at = new Date().toISOString();
    }
    if (Object.keys(updateData).length > 0) {
      await supabase
        .from("refunds")
        .update(updateData)
        .eq("paymongo_refund_id", linkOrPaymentId);
    }
    return NextResponse.json({ ok: true, kind: "refund" });
  }

  // Payment events — capture nested payment ID -----------------------------
  let actualPaymentId: string | null = null;
  if (inner?.attributes?.payments?.length) {
    actualPaymentId = inner.attributes.payments[0]?.data?.id ?? null;
  }

  // Find which entity this payment belongs to — Playcation reservation (initial payment), a
  // reservation balance payment, an order, a wallet top-up, or a per-branch cafe PC reservation.
  const [reservation, balanceRes, order, topupRes, pcReservation] = await Promise.all([
    getReservationByIntent(linkOrPaymentId).catch(() => null),
    getReservationByBalanceIntent(linkOrPaymentId).catch(() => null),
    getOrderByIntent(linkOrPaymentId).catch(() => null),
    (async () => {
      try {
        const { data } = await supabase
          .from("member_topups")
          .select("id, branch_id, customer_email, customer_name, member_number, amount_php")
          .eq("paymongo_intent_id", linkOrPaymentId)
          .maybeSingle();
        return data;
      } catch {
        return null;
      }
    })(),
    (async () => {
      // Resolve the cafe booking by, in order: the row already found during signature verification →
      // the pi_ (what payment.paid carries; the reliable key) → the cs_/link id (fallback). The pi_
      // path is THE fix for "paid bookings never confirmed" (we matched the wrong id before).
      try {
        if (cafeReservationId) {
          const { data } = await supabase
            .from("pc_reservations")
            .select("id, branch_id, status, payment_status, reservation_code")
            .eq("id", cafeReservationId)
            .maybeSingle();
          if (data) return data;
        }
        if (paymentIntentId) {
          const { data } = await supabase
            .from("pc_reservations")
            .select("id, branch_id, status, payment_status, reservation_code")
            .eq("paymongo_payment_intent_id", paymentIntentId)
            .maybeSingle();
          if (data) return data;
        }
        if (linkOrPaymentId) {
          const { data } = await supabase
            .from("pc_reservations")
            .select("id, branch_id, status, payment_status, reservation_code")
            .eq("paymongo_intent_id", linkOrPaymentId)
            .maybeSingle();
          if (data) return data;
        }
        return null;
      } catch {
        return null;
      }
    })(),
  ]);

  try {
    // Per-branch cafe PC reservation (Chunk 6). On paid: mark it paid + ensure a reservation_code,
    // leaving status='pending' so the POS — which polls pc_reservations for newly-paid rows at its
    // branch — picks it up and the cashier can find it by code on arrival. We DELIBERATELY do NOT
    // compute or apply any member bonus / balance here: PanCafe applies the real bonus when the
    // cashier loads the paid top-up (flowchart §G/§K). On failed/expired: release the held station.
    if (pcReservation) {
      switch (eventType) {
        // 'checkout_session.payment.paid' is the event a hosted Checkout Session fires (the new
        // bookings path, 2026-06-01). Only bookings store a cs_ id in paymongo_intent_id, so this
        // case can only ever match a pc_reservation — existing link/payment flows are untouched.
        // NOTE (to verify on the card-block live test): for a Checkout Session the actual pay_ id is
        // expected at inner.attributes.payments[0].data.id (same shape as link.payment.paid, which the
        // real records confirmed). If that shape differs, actualPaymentId is just null and the booking
        // STILL confirms (paid) — we only lose the audit pay_ id, never the confirmation. Fails soft.
        case "checkout_session.payment.paid":
        case "link.payment.paid":
        case "payment.paid": {
          const update: Record<string, unknown> = {
            payment_status: "paid",
            paymongo_payment_id: actualPaymentId ?? null,
          };
          // reservation_code is normally set at create time; backfill if somehow missing so the
          // cashier always has a code to look up.
          if (!pcReservation.reservation_code) {
            const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let code = "";
            for (let i = 0; i < 6; i++) {
              code += alphabet[Math.floor(Math.random() * alphabet.length)];
            }
            update.reservation_code = code;
          }
          // Guard: only confirm a booking that is STILL pending + unpaid. This (a) is idempotent against
          // duplicate webhooks, and (b) does NOT resurrect an EXPIRED booking whose seat already
          // auto-released (owner 2026-06-01: a payment that lands after expiry must not silently revive
          // the booking onto a possibly-taken seat). A late payment therefore stays unmatched here — it's
          // a paid-but-no-live-booking case to handle separately (auto-refund / flag — the "seat-race"
          // step we deferred). With the 20-min hold this is rare; until then it surfaces as an unmatched
          // PayMongo payment rather than a wrong confirmation.
          const { data: confirmed } = await supabase
            .from("pc_reservations")
            .update(update)
            .eq("id", pcReservation.id)
            .eq("status", "pending")
            .eq("payment_status", "unpaid")
            .select("id");
          if (!confirmed || confirmed.length === 0) {
            console.warn(
              `[paymongo webhook] paid event for pc_reservation ${pcReservation.id} but it was not pending+unpaid (status=${pcReservation.status}, payment_status=${pcReservation.payment_status}) — NOT confirmed; likely paid-after-expiry, needs refund/review`,
            );
          }
          break;
        }
        case "checkout_session.payment.failed":
        case "link.payment.failed":
        case "payment.failed": {
          // Payment didn't go through → release the seat so it returns to the vacant list.
          await supabase
            .from("pc_reservations")
            .update({
              status: "cancelled",
              payment_status: "failed",
              cancelled_at: new Date().toISOString(),
            })
            .eq("id", pcReservation.id)
            .eq("status", "pending");
          break;
        }
      }
      return NextResponse.json({ ok: true, kind: "pc_reservation" });
    }

    if (reservation) {
      switch (eventType) {
        case "link.payment.paid":
        case "payment.paid": {
          await confirmReservation(reservation.id);
          if (actualPaymentId) {
            await supabase
              .from("reservations")
              .update({ paymongo_payment_id: actualPaymentId })
              .eq("id", reservation.id);
          }
          // Purge branch page cache so availability calendar updates immediately
          {
            const { data: b } = await supabase.from("branches").select("slug").eq("id", reservation.branch_id).maybeSingle();
            if (b?.slug) revalidatePath(`/branches/${b.slug}`);
          }
          // Fire confirmation email (best effort)
          if (reservation.guest_email) {
            const { data: branch } = await supabase
              .from("branches")
              .select("name, slug, address, branch_rates (check_in_time, check_out_time, sort_order)")
              .eq("id", reservation.branch_id)
              .maybeSingle();
            const rates = (
              (branch as { branch_rates?: Array<{ check_in_time: string | null; check_out_time: string | null; sort_order: number }> } | null)
                ?.branch_rates ?? []
            ).sort((a, b) => a.sort_order - b.sort_order);
            const rateWithTime = rates.find((r) => r.check_in_time);
            sendBookingConfirmation({
              to: reservation.guest_email,
              guestName: reservation.guest_name ?? "there",
              branchName: (branch as { name?: string } | null)?.name ?? "Comffee Playcation",
              branchSlug: (branch as { slug?: string } | null)?.slug ?? "",
              branchAddress: (branch as { address?: string | null } | null)?.address ?? null,
              checkIn: reservation.check_in,
              checkOut: reservation.check_out,
              checkInTime: rateWithTime?.check_in_time ?? null,
              checkOutTime: rateWithTime?.check_out_time ?? null,
              numGuests: reservation.num_guests ?? 1,
              totalPhp: Number(reservation.total_php ?? 0),
              reservationId: reservation.id,
              instructionPhotos: (await listInstructionPhotos(reservation.branch_id)).map((p) => ({
                label: p.label,
                url: p.signedUrl,
              })),
            }).catch((e) => console.error("[email] booking failed", e));
          }
          break;
        }
        case "link.payment.failed":
        case "payment.failed": {
          await cancelReservation(reservation.id, `paymongo: ${eventType}`);
          const { data: b } = await supabase.from("branches").select("slug").eq("id", reservation.branch_id).maybeSingle();
          if (b?.slug) revalidatePath(`/branches/${b.slug}`);
          break;
        }
      }
      return NextResponse.json({ ok: true, kind: "reservation" });
    }

    if (balanceRes) {
      switch (eventType) {
        case "link.payment.paid":
        case "payment.paid": {
          // The booking is already confirmed; this just settles the 70% balance.
          await markBalancePaid(balanceRes.id, actualPaymentId ?? undefined);
          if (balanceRes.guest_email) {
            const { data: branch } = await supabase
              .from("branches")
              .select("name")
              .eq("id", balanceRes.branch_id)
              .maybeSingle();
            sendBalancePaidReceipt({
              to: balanceRes.guest_email,
              guestName: balanceRes.guest_name ?? "there",
              branchName: (branch as { name?: string } | null)?.name ?? "Comffee Playcation",
              checkIn: balanceRes.check_in,
              checkOut: balanceRes.check_out,
              balancePhp: Number(balanceRes.balance_php ?? 0),
              reservationId: balanceRes.id,
            }).catch((e) => console.error("[email] balance receipt failed", e));
          }
          break;
        }
        // payment.failed: nothing to undo — the booking stays confirmed and the
        // guest can retry the balance payment from their account.
      }
      return NextResponse.json({ ok: true, kind: "reservation_balance" });
    }

    if (order) {
      switch (eventType) {
        case "link.payment.paid":
        case "payment.paid": {
          await markOrderPaid(order.id);
          if (actualPaymentId) {
            await supabase
              .from("orders")
              .update({ paymongo_payment_id: actualPaymentId })
              .eq("id", order.id);
          }
          // Fire confirmation email with line items
          if (order.customer_email) {
            const fullOrder = await getOrderById(order.id);
            const items =
              (fullOrder?.items as Array<{
                name_snapshot: string;
                qty: number;
                line_total: number;
              }>) ?? [];
            const branchName =
              (fullOrder as { branch?: { name?: string } | null })?.branch?.name ??
              "Comffee";
            sendOrderConfirmation({
              to: order.customer_email,
              customerName: order.customer_name ?? "there",
              branchName,
              totalPhp: Number(order.total_php ?? 0),
              scheduledFor: order.scheduled_for ?? null,
              orderId: order.id,
              items: items.map((it) => ({
                name: it.name_snapshot,
                qty: it.qty,
                lineTotalPhp: Number(it.line_total),
              })),
            }).catch((e) => console.error("[email] order failed", e));
          }
          break;
        }
        case "link.payment.failed":
        case "payment.failed":
          await markOrderFailed(order.id, `paymongo: ${eventType}`);
          break;
      }
      return NextResponse.json({ ok: true, kind: "order" });
    }

    if (topupRes) {
      switch (eventType) {
        case "link.payment.paid":
        case "payment.paid": {
          await supabase
            .from("member_topups")
            .update({
              payment_status: "paid",
              paymongo_payment_id: actualPaymentId ?? null,
            })
            .eq("id", topupRes.id);
          break;
        }
        case "link.payment.failed":
        case "payment.failed":
          await supabase
            .from("member_topups")
            .update({ payment_status: "failed" })
            .eq("id", topupRes.id);
          break;
      }
      return NextResponse.json({ ok: true, kind: "topup" });
    }

    return NextResponse.json({ ok: true, ignored: "no_match_for_link" });
  } catch (e) {
    console.error("webhook handling failed", e instanceof Error ? e.message : e);
    // We recorded this event up-front for idempotency. Since handling it failed,
    // delete that record so PayMongo's automatic retry reprocesses the event.
    // Without this, the retry would be treated as a duplicate and the payment
    // would never get applied — the booking would stay on hold and auto-cancel.
    await supabase
      .from("paymongo_webhook_events")
      .delete()
      .eq("paymongo_event_id", eventId);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}
