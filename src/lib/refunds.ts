import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createRefund, isPaymongoConfigured } from "@/lib/paymongo";

export interface IssueRefundInput {
  orderId?: string;
  reservationId?: string;
  amountPhp: number;
  reason: string;
  adminId: string;
}

export interface RefundResult {
  id: string;
  paymongoRefundId: string | null;
  status: "pending" | "succeeded" | "failed";
  simulated: boolean;
}

/**
 * Issue a refund for an order or reservation. Calls PayMongo if configured,
 * otherwise records a "simulated" refund and immediately marks the parent
 * row as refunded so the dev flow stays usable.
 */
export async function issueRefund(input: IssueRefundInput): Promise<RefundResult> {
  if (!input.orderId && !input.reservationId) {
    throw new Error("must specify orderId or reservationId");
  }
  const supabase = getSupabaseAdmin();

  // Look up the parent row to grab the PayMongo payment ID
  let paymentId: string | null = null;
  let totalPhp = 0;
  if (input.orderId) {
    const { data } = await supabase
      .from("orders")
      .select("paymongo_payment_id, total_php")
      .eq("id", input.orderId)
      .maybeSingle();
    if (!data) throw new Error("order not found");
    paymentId = data.paymongo_payment_id ?? null;
    totalPhp = Number(data.total_php ?? 0);
  } else if (input.reservationId) {
    const { data } = await supabase
      .from("reservations")
      .select("paymongo_payment_id, total_php")
      .eq("id", input.reservationId)
      .maybeSingle();
    if (!data) throw new Error("reservation not found");
    paymentId = data.paymongo_payment_id ?? null;
    totalPhp = Number(data.total_php ?? 0);
  }

  if (input.amountPhp <= 0 || input.amountPhp > totalPhp) {
    throw new Error(`invalid amount (max ${totalPhp})`);
  }

  // Insert the refund row first as 'pending'
  const { data: refund, error: insertErr } = await supabase
    .from("refunds")
    .insert({
      order_id: input.orderId ?? null,
      reservation_id: input.reservationId ?? null,
      amount_php: input.amountPhp,
      reason: input.reason,
      status: "pending",
      created_by_admin_id: input.adminId,
    })
    .select("id")
    .single();
  if (insertErr || !refund) {
    throw new Error(`refund insert failed: ${insertErr?.message}`);
  }

  // Dev mode: no PayMongo → mark refunded immediately
  if (!isPaymongoConfigured() || !paymentId) {
    await supabase
      .from("refunds")
      .update({
        status: "succeeded",
        refunded_at: new Date().toISOString(),
      })
      .eq("id", refund.id);
    await markParentRefunded(input, totalPhp);
    return {
      id: refund.id,
      paymongoRefundId: null,
      status: "succeeded",
      simulated: true,
    };
  }

  // Real PayMongo refund
  try {
    const result = await createRefund({
      paymentId,
      amountPhp: input.amountPhp,
      reason: "requested_by_customer",
      notes: input.reason,
    });
    await supabase
      .from("refunds")
      .update({
        paymongo_refund_id: result.id,
        status: result.status === "succeeded" ? "succeeded" : "pending",
        refunded_at:
          result.status === "succeeded" ? new Date().toISOString() : null,
      })
      .eq("id", refund.id);

    if (result.status === "succeeded") {
      await markParentRefunded(input, totalPhp);
    }

    return {
      id: refund.id,
      paymongoRefundId: result.id,
      status: result.status === "succeeded" ? "succeeded" : "pending",
      simulated: false,
    };
  } catch (e) {
    await supabase
      .from("refunds")
      .update({ status: "failed" })
      .eq("id", refund.id);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("source type qrph")) {
      throw new Error("QRPH_MANUAL_REQUIRED");
    }
    throw e;
  }
}

async function markParentRefunded(input: IssueRefundInput, totalPhp: number) {
  const supabase = getSupabaseAdmin();
  // If full refund: payment_status='refunded'. Partial → keep paid status, the
  // refund row tracks the partial amount.
  // For MVP we mark refunded only when amount equals total.
  if (input.orderId) {
    const { data: existing } = await supabase
      .from("refunds")
      .select("amount_php")
      .eq("order_id", input.orderId)
      .eq("status", "succeeded");
    const totalRefunded = (existing ?? []).reduce(
      (s, r) => s + Number(r.amount_php),
      0,
    );
    if (totalRefunded >= totalPhp) {
      await supabase
        .from("orders")
        .update({ payment_status: "refunded", status: "cancelled" })
        .eq("id", input.orderId);
    }
  } else if (input.reservationId) {
    const { data: existing } = await supabase
      .from("refunds")
      .select("amount_php")
      .eq("reservation_id", input.reservationId)
      .eq("status", "succeeded");
    const totalRefunded = (existing ?? []).reduce(
      (s, r) => s + Number(r.amount_php),
      0,
    );
    if (totalRefunded >= totalPhp) {
      await supabase
        .from("reservations")
        .update({ status: "cancelled", notes: "refunded" })
        .eq("id", input.reservationId);
    }
  }
}
