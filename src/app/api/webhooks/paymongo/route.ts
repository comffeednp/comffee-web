import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  cancelReservation,
  getReservationByBalanceIntent,
  getReservationByIntent,
  markBalancePaid,
} from "@/lib/reservations";
import { confirmAndNotifyReservation } from "@/lib/booking-confirm";
import {
  getOrderById,
  getOrderByIntent,
  markOrderFailed,
  markOrderPaid,
} from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/paymongo";
import { sendBalancePaidReceipt, sendOrderConfirmation } from "@/lib/email";
import {
  getGameTopupOrderByPaymongoId,
  markGameTopupPaid,
} from "@/lib/game-topups/settlement";

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
          // A checkout-session payment.paid event carries the backing Payment Intent
          // id (pi_) here — proven match key for checkout-session flows (see paymongo.ts).
          payment_intent_id?: string;
          amount?: number;
        };
      };
    };
  };
}

/**
 * PayMongo webhook handler — handles reservations + orders + refunds.
 *
 *  - Verifies HMAC signature (constant-time compare)
 *  - Idempotent via paymongo_webhook_events unique constraint
 *  - On payment.paid: captures the payment.id, marks the parent row paid,
 *    and fires the customer confirmation email
 *  - On refund events: marks the corresponding refund row succeeded
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("paymongo-signature");
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    console.error("paymongo webhook: bad signature");
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

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

  if (!eventId) {
    return NextResponse.json({ error: "no_event_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

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
  // Checkout-session flows (game top-ups) match on the backing Payment Intent id.
  const innerPaymentIntentId = inner?.attributes?.payment_intent_id ?? null;

  // Find which entity this payment belongs to — reservation (initial payment),
  // a reservation balance payment, an order, a wallet top-up, or a game top-up.
  const [reservation, balanceRes, order, topupRes, gameTopup] = await Promise.all([
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
    getGameTopupOrderByPaymongoId([
      linkOrPaymentId,
      innerPaymentIntentId,
      actualPaymentId,
    ]).catch(() => null),
  ]);

  try {
    if (reservation) {
      switch (eventType) {
        case "link.payment.paid":
        case "payment.paid": {
          await confirmAndNotifyReservation(reservation, actualPaymentId);
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

    if (gameTopup) {
      switch (eventType) {
        case "checkout_session.payment.paid":
        case "link.payment.paid":
        case "payment.paid": {
          // verified → pending: the order joins the staff fulfilment queue and the
          // SLA clock starts. Idempotent + monotonic (only flips a 'verified' row),
          // so a duplicate/retried webhook is a harmless no-op.
          await markGameTopupPaid(gameTopup.id, actualPaymentId);
          break;
        }
        // payment.failed: nothing to undo — the order stays 'verified' (the state
        // machine has no verified→failed edge) so the customer can retry checkout.
      }
      return NextResponse.json({ ok: true, kind: "game_topup" });
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
