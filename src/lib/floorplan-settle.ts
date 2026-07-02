import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getBranchPaymentConfig } from "@/lib/branch-payment-config";
import { retrieveCheckoutSession } from "@/lib/paymongo";

// Settlement for PS5/table floor-plan reservations (fix 2026-07-02).
//
// A PS5 (time_rate) booking is inserted 'pending' and paid on PayMongo's hosted checkout with the
// BRANCH owner's own key. That per-branch account can't sign events against our single platform
// webhook secret, so no webhook ever confirms these — settlement is PULL-based instead: we ask
// PayMongo for the checkout session's payments and flip pending→confirmed (paid) or expire a stale
// unpaid hold. Callers: the [id]/status poll route (customer back from checkout), the create +
// availability routes (free stale-blocked slots), and the 10-min release-expired-holds cron (rescues
// a paid customer who never returned). The POS pulls status='confirmed' rows — nothing POS-side
// needs to change.
//
// Safety rule (same as the playcation hold sweep): NEVER expire a hold we failed to verify — a
// PayMongo outage must not eat a paid booking. Expiry needs a VERIFIED-unpaid session (or a row
// that can never be verified: no checkout id / branch key gone).

export const FP_UNPAID_HOLD_MINUTES = 20; // matches pc-reservations' unpaid-hold window

export type FpSettleOutcome = "confirmed" | "expired" | "pending" | string;

export interface FpPendingRow {
  id: string;
  branch_id: string;
  status: string;
  payment_status: string;
  paymongo_intent_id: string | null;
  created_at: string;
}

function isStale(row: FpPendingRow): boolean {
  return Date.now() - new Date(row.created_at).getTime() > FP_UNPAID_HOLD_MINUTES * 60 * 1000;
}

/**
 * Settle ONE pending reservation against PayMongo. Race-safe: both writes are guarded on the row
 * still being pending/unpaid, so concurrent settlers (poll + cron) can't clobber each other and
 * confirm is one-way.
 */
export async function settleFloorplanRow(
  row: FpPendingRow,
  paymongoSecretKey: string | null,
): Promise<FpSettleOutcome> {
  if (row.status !== "pending" || row.payment_status !== "unpaid") return row.status;
  const admin = getSupabaseAdmin();

  if (row.paymongo_intent_id && paymongoSecretKey) {
    let paid: boolean;
    try {
      paid = (await retrieveCheckoutSession(row.paymongo_intent_id, paymongoSecretKey)).paid;
    } catch {
      return "pending"; // couldn't verify — leave it; the next poll/sweep retries
    }
    if (paid) {
      await admin
        .from("floorplan_reservations")
        .update({ status: "confirmed", payment_status: "paid" })
        .eq("id", row.id)
        .eq("status", "pending");
      return "confirmed";
    }
    if (!isStale(row)) return "pending"; // verified-unpaid but still inside the pay window
  } else if (!isStale(row)) {
    return "pending";
  }
  // Verified-unpaid past the window, or unverifiable (checkout never created / branch key removed —
  // no payment can ever arrive for it): free the slot.
  await admin
    .from("floorplan_reservations")
    .update({ status: "expired", payment_status: "expired" })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("payment_status", "unpaid");
  return "expired";
}

/**
 * Sweep pending reservations (optionally one branch; staleOnly=true limits PayMongo calls to rows
 * past the pay window — use that in request paths; the cron passes false to rescue paid bookings
 * within ~10 min). Bounded to 25 rows per run.
 */
export async function settleFloorplanPendings(opts: {
  branchId?: string;
  staleOnly: boolean;
}): Promise<{ checked: number; confirmed: number; expired: number }> {
  const admin = getSupabaseAdmin();
  let q = admin
    .from("floorplan_reservations")
    .select("id, branch_id, status, payment_status, paymongo_intent_id, created_at")
    .eq("status", "pending")
    .eq("payment_status", "unpaid")
    .order("created_at", { ascending: true })
    .limit(25);
  if (opts.branchId) q = q.eq("branch_id", opts.branchId);
  if (opts.staleOnly) {
    q = q.lt("created_at", new Date(Date.now() - FP_UNPAID_HOLD_MINUTES * 60 * 1000).toISOString());
  }
  const { data: rows } = await q;
  const out = { checked: 0, confirmed: 0, expired: 0 };
  if (!rows?.length) return out;

  const keyByBranch = new Map<string, string | null>();
  for (const row of rows as FpPendingRow[]) {
    if (!keyByBranch.has(row.branch_id)) {
      const config = await getBranchPaymentConfig(row.branch_id);
      keyByBranch.set(row.branch_id, config?.paymongo_secret_key ?? null);
    }
    out.checked++;
    const outcome = await settleFloorplanRow(row, keyByBranch.get(row.branch_id) ?? null);
    if (outcome === "confirmed") out.confirmed++;
    else if (outcome === "expired") out.expired++;
  }
  return out;
}
