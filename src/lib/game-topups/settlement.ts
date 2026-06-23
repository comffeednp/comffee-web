import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTopupSettings } from "./config";

// Settlement = the "paid" half of the Game Top-Ups state machine (state.ts):
//   verified ──paid (PayMongo webhook)──> pending
// Without this, a paid order is stuck at `verified`: it never enters the staff
// `pending` fulfilment queue and the SLA sweeper never sees it. This is the branch
// the PayMongo webhook calls (see app/api/webhooks/paymongo/route.ts).

/**
 * Find a Game Top-Up order by ANY PayMongo id a webhook might carry. A checkout-
 * session `payment.paid` event surfaces the payment-intent id (pi_) at
 * data.attributes.data.attributes.payment_intent_id, the payment id (pay_) as the
 * inner id, and — depending on event shape — possibly the checkout-session id (cs_).
 * All three are stored on the order and are globally unique, so matching on any of
 * them finds exactly the right order with no risk of a false match.
 */
export async function getGameTopupOrderByPaymongoId(
  ids: Array<string | null | undefined>,
) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return null;
  const supabase = getSupabaseAdmin();
  // PayMongo ids are [A-Za-z0-9_] only, so they're safe to inline in the or() filter.
  const ors = list
    .flatMap((v) => [
      `paymongo_payment_intent_id.eq.${v}`,
      `paymongo_checkout_id.eq.${v}`,
      `paymongo_payment_id.eq.${v}`,
    ])
    .join(",");
  const { data, error } = await supabase
    .from("game_topup_orders")
    .select("*")
    .or(ors)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Settle a paid order: `verified` → `pending`, stamp `paid_at` and `sla_due_at`
 * (now + the SLA window from settings, default 24h). The UPDATE is conditional on
 * `status = 'verified'`, which makes it idempotent and monotonic: a duplicate or
 * retried webhook is a no-op, and an order a human has already advanced to
 * processing/delivered is never clobbered back to pending.
 *
 * @returns true if THIS call performed the flip; false if it was already settled.
 */
export async function markGameTopupPaid(
  orderId: string,
  paymentId?: string | null,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const settings = await getTopupSettings();
  const now = Date.now();
  const patch: Record<string, unknown> = {
    status: "pending",
    paid_at: new Date(now).toISOString(),
    sla_due_at: new Date(now + settings.slaMinutes * 60_000).toISOString(),
  };
  if (paymentId) patch.paymongo_payment_id = paymentId;
  const { data, error } = await supabase
    .from("game_topup_orders")
    .update(patch)
    .eq("id", orderId)
    .eq("status", "verified")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}
