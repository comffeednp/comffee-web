"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { markLineDeliveredManual } from "@/lib/game-topups/fulfillment";

// Staff fulfilment console actions. requireEditor() gates every mutation (partners are read-only).

export async function claimOrderAction(orderId: string) {
  const admin = await requireEditor();
  const sb = getSupabaseAdmin();
  await sb
    .from("game_topup_orders")
    .update({ status: "processing", claimed_by_admin_id: admin.id, claimed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending");
  revalidatePath("/admin/game-topups");
}

export async function releaseOrderAction(orderId: string) {
  await requireEditor();
  const sb = getSupabaseAdmin();
  await sb
    .from("game_topup_orders")
    .update({ status: "pending", claimed_by_admin_id: null, claimed_at: null })
    .eq("id", orderId)
    .eq("status", "processing");
  revalidatePath("/admin/game-topups");
}

export async function deliverLineAction(lineId: string) {
  await requireEditor();
  const res = await markLineDeliveredManual(lineId);
  revalidatePath("/admin/game-topups");
  return res;
}

// Mark an order failed (e.g. couldn't deliver) — flags it for a manual refund. Does NOT call PayMongo;
// QR Ph refunds are a manual GCash/InstaPay transfer (the SLA sweeper handles card refunds automatically).
export async function failOrderAction(orderId: string, reason: string) {
  await requireEditor();
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("game_topup_orders")
    .update({ status: "failed" })
    .eq("id", orderId)
    .in("status", ["pending", "processing"])
    .select("id");
  if (data && data.length > 0) {
    await sb.from("game_topup_fulfillment_events").insert({
      order_id: orderId,
      source: "manual",
      raw_text: `marked failed by staff: ${String(reason || "").slice(0, 200)} — manual refund required`,
      ref: `manual-fail-${orderId}-${Date.now()}`,
    });
  }
  revalidatePath("/admin/game-topups");
}
