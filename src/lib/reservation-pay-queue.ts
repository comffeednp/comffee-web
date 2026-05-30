import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Payment QUEUE for DIY-QR online reservations (2026-05-30).
//
// The POS confirms a reservation payment by AMOUNT (it watches PayMongo on the Bookings code). So two
// reservations of the EXACT same total awaiting payment at once would be ambiguous. The owner's fix:
// serialize same-amount payments — only ONE reservation per (branch, total) may be in the 'awaiting'
// (active pay-window) state at a time. Enforced atomically by the partial unique index
// `pc_reservations_one_awaiting_per_amount` (migration 0041). Customers paying DIFFERENT amounts are
// unaffected and pay concurrently.
//
// payment_status flow: 'queued' -> 'awaiting' -> 'paid' (POS) | 'expired'.

export const PAY_WINDOW_MINUTES = 5;

export type PayStatus = "queued" | "awaiting" | "paid" | "expired";

/**
 * Try to give this 'queued' reservation the active pay slot for its amount. Idempotent + safe to call
 * repeatedly (the confirmed page polls it). Returns the reservation's resulting payment_status.
 *
 *  1. Lazy-expire the current holder if its window lapsed (frees the slot for the next in line).
 *  2. Atomically claim: UPDATE this row queued->awaiting. The partial unique index rejects the update
 *     (Postgres 23505) if another same-amount 'awaiting' already exists -> we leave it 'queued' to wait.
 */
export async function claimPaySlot(
  reservationId: string,
  branchId: string,
  totalPhp: number,
): Promise<PayStatus> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1) Free the slot if the current same-amount holder's window passed.
  await admin
    .from("pc_reservations")
    .update({ payment_status: "expired" })
    .eq("branch_id", branchId)
    .eq("total_php", totalPhp)
    .eq("payment_status", "awaiting")
    .lt("payment_hold_expires_at", nowIso);

  // 2) Atomic claim (only if still 'queued'). 23505 = a same-amount 'awaiting' already holds the slot.
  const expiresIso = new Date(Date.now() + PAY_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("pc_reservations")
    .update({ payment_status: "awaiting", payment_hold_expires_at: expiresIso })
    .eq("id", reservationId)
    .eq("payment_status", "queued")
    .select("payment_status")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return "queued"; // someone else is paying this exact amount — wait our turn
    throw error;
  }
  // No row updated (data null) means it wasn't 'queued' anymore (already awaiting/paid/expired) — read it.
  if (!data) {
    const { data: cur } = await admin
      .from("pc_reservations")
      .select("payment_status")
      .eq("id", reservationId)
      .maybeSingle();
    return (cur?.payment_status as PayStatus) ?? "queued";
  }
  return data.payment_status as PayStatus;
}
