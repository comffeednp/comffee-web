import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  cancelReservation,
  confirmReservation,
  getReservationByIntent,
} from "@/lib/reservations";
import {
  getOrderById,
  getOrderByIntent,
  markOrderFailed,
  markOrderPaid,
} from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/paymongo";
import { sendBookingConfirmation, sendOrderConfirmation } from "@/lib/email";

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

  // Find which entity this payment belongs to — reservation, order, or topup
  const [reservation, order, topupRes] = await Promise.all([
    getReservationByIntent(linkOrPaymentId).catch(() => null),
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
  ]);

  try {
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
              .select("name, slug")
              .eq("id", reservation.branch_id)
              .maybeSingle();
            sendBookingConfirmation({
              to: reservation.guest_email,
              guestName: reservation.guest_name ?? "there",
              branchName: branch?.name ?? "Comffee Playcation",
              branchSlug: branch?.slug ?? "",
              checkIn: reservation.check_in,
              checkOut: reservation.check_out,
              numGuests: reservation.num_guests ?? 1,
              totalPhp: Number(reservation.total_php ?? 0),
              reservationId: reservation.id,
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
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}
