import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface OrderLineInput {
  menuItemId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  qty: number;
}

export interface CreateOrderInput {
  branchId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  scheduledFor?: string | null;
  notes?: string | null;
  items: OrderLineInput[];
}

export interface CreatedOrder {
  id: string;
  total_php: number;
}

/** Insert an order + its line items in a single round trip. */
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  if (input.items.length === 0) {
    throw new Error("empty cart");
  }
  const supabase = getSupabaseAdmin();

  const total = input.items.reduce(
    (s, i) => s + i.priceSnapshot * i.qty,
    0,
  );

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      type: "advance",
      branch_id: input.branchId,
      customer_name: input.customerName,
      customer_phone: input.customerPhone ?? null,
      customer_email: input.customerEmail ?? null,
      total_php: total,
      status: "placed",
      payment_status: "unpaid",
      scheduled_for: input.scheduledFor ?? null,
      notes: input.notes ?? null,
    })
    .select("id, total_php")
    .single();

  if (orderErr || !order) {
    throw new Error(`order create failed: ${orderErr?.message}`);
  }

  const lineRows = input.items.map((i) => ({
    order_id: order.id,
    menu_item_id: i.menuItemId,
    name_snapshot: i.nameSnapshot,
    price_snapshot: i.priceSnapshot,
    qty: i.qty,
  }));

  const { error: itemsErr } = await supabase.from("order_items").insert(lineRows);
  if (itemsErr) {
    // Roll back the order
    await supabase.from("orders").delete().eq("id", order.id);
    throw new Error(`order items insert failed: ${itemsErr.message}`);
  }

  return { id: order.id, total_php: Number(order.total_php) };
}

export async function attachOrderPaymentIntent(orderId: string, intentId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("orders")
    .update({ paymongo_intent_id: intentId, payment_status: "pending" })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function markOrderPaid(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function markOrderFailed(orderId: string, reason?: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "failed",
      status: "cancelled",
      notes: reason ?? null,
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function getOrderByIntent(intentId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("paymongo_intent_id", intentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getOrderById(id: string) {
  const supabase = getSupabaseAdmin();
  const [orderRes, itemsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("*, branch:branches(id, slug, name, type)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("order_items").select("*").eq("order_id", id),
  ]);
  if (!orderRes.data) return null;
  return {
    ...orderRes.data,
    items: itemsRes.data ?? [],
  };
}
