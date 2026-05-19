import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, attachOrderPaymentIntent, markOrderPaid } from "@/lib/orders";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createPaymentLink, isPaymongoConfigured } from "@/lib/paymongo";
import { recordRedemption, validatePromoCode } from "@/lib/promo-codes";
import { guardMutating } from "@/lib/security";
import { sendOrderConfirmation } from "@/lib/email";

export const runtime = "nodejs";

const itemSchema = z.object({
  menuItemId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
});

const schema = z.object({
  branchId: z.string().uuid(),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional().or(z.literal("")),
  customerEmail: z.string().email().optional().or(z.literal("")),
  scheduledFor: z.string().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  items: z.array(itemSchema).min(1),
  promoCode: z.string().max(40).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "orders-create",
    limit: 10,
    windowMs: 10 * 60 * 1000,
    maxBytes: 16 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }
  const v = parsed.data;
  const supabase = getSupabaseAdmin();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, type")
    .eq("id", v.branchId)
    .maybeSingle();
  if (!branch) {
    return NextResponse.json({ error: "branch_not_found" }, { status: 400 });
  }

  const ids = v.items.map((i) => i.menuItemId);
  const { data: menuItems, error: miErr } = await supabase
    .from("menu_items")
    .select("id, name, base_price_php, available")
    .in("id", ids);
  if (miErr || !menuItems) {
    return NextResponse.json({ error: "menu_lookup_failed" }, { status: 500 });
  }
  const byId = new Map(menuItems.map((m) => [m.id, m]));

  for (const it of v.items) {
    const m = byId.get(it.menuItemId);
    if (!m || !m.available) {
      return NextResponse.json(
        { error: "item_unavailable", menuItemId: it.menuItemId },
        { status: 400 },
      );
    }
  }

  const subtotal = v.items.reduce((s, it) => {
    const m = byId.get(it.menuItemId)!;
    return s + Number(m.base_price_php) * it.qty;
  }, 0);

  // Apply promo if any
  let discount = 0;
  let promoCodeId: string | null = null;
  if (v.promoCode) {
    try {
      const result = await validatePromoCode(v.promoCode, subtotal, "order");
      discount = result.discountPhp;
      promoCodeId = result.promoCode.id;
    } catch (e) {
      return NextResponse.json(
        { error: "promo_invalid", detail: e instanceof Error ? e.message : "unknown" },
        { status: 400 },
      );
    }
  }

  let order;
  try {
    order = await createOrder({
      branchId: v.branchId,
      customerName: v.customerName,
      customerPhone: v.customerPhone || undefined,
      customerEmail: v.customerEmail || undefined,
      scheduledFor: v.scheduledFor || null,
      notes: v.notes || null,
      items: v.items.map((it) => {
        const m = byId.get(it.menuItemId)!;
        return {
          menuItemId: m.id,
          nameSnapshot: m.name,
          priceSnapshot: Number(m.base_price_php),
          qty: it.qty,
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "order_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }

  // Apply discount to the order row + adjust total
  if (discount > 0 && promoCodeId) {
    const finalTotal = Math.max(0, order.total_php - discount);
    await supabase
      .from("orders")
      .update({
        discount_php: discount,
        promo_code_id: promoCodeId,
        total_php: finalTotal,
      })
      .eq("id", order.id);
    await recordRedemption({
      promoCodeId,
      discountPhp: discount,
      orderId: order.id,
    });
    order.total_php = finalTotal;
  }

  // Dev mode: no PayMongo → mark paid immediately + send email
  if (!isPaymongoConfigured()) {
    try {
      await markOrderPaid(order.id);
    } catch (e) {
      console.error("simulated paid failed", e);
    }
    if (v.customerEmail) {
      sendOrderConfirmation({
        to: v.customerEmail,
        customerName: v.customerName,
        branchName: branch.name,
        totalPhp: order.total_php,
        scheduledFor: v.scheduledFor || null,
        orderId: order.id,
        items: v.items.map((it) => {
          const m = byId.get(it.menuItemId)!;
          return {
            name: m.name,
            qty: it.qty,
            lineTotalPhp: Number(m.base_price_php) * it.qty,
          };
        }),
      }).catch((e) => console.error("[email] order failed", e));
    }
    return NextResponse.json({
      ok: true,
      simulated: true,
      orderId: order.id,
      total: order.total_php,
      discount,
    });
  }

  try {
    const link = await createPaymentLink({
      amountPhp: order.total_php,
      description: `Comffee order @ ${branch.name}`,
      remarks: `order:${order.id}`,
    });
    await attachOrderPaymentIntent(order.id, link.id);
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      checkoutUrl: link.checkout_url,
      discount,
    });
  } catch (e) {
    console.error("paymongo error", e);
    await supabase.from("order_items").delete().eq("order_id", order.id);
    await supabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json(
      { error: "payment_link_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
