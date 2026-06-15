import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { guardMutating } from "@/lib/security";
import { getBranchPaymentConfig, isPaymongoReservationActive } from "@/lib/branch-payment-config";
import { createCheckoutSession, bookingPaymentMethods } from "@/lib/paymongo";

export const runtime = "nodejs";

// Online reservation of a floor-plan spot (PS5 = prepay; dining table = minimum-order pledge). The
// POS pulls confirmed ones into its live board. Mirrors the PC-reservation payment plumbing but the
// price comes from the element itself (rate_per_hour / min_order_amount), not a rates table.
function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  return u && u.startsWith("https://") ? u : "https://comffee.org";
}

const schema = z.object({
  branchId: z.string().uuid(),
  elementIdx: z.number().int().min(0).max(1000),
  customerName: z.string().min(1).max(120),
  customerContact: z.string().max(60).optional().or(z.literal("")),
  startAt: z.string().datetime(),
  durationMin: z.number().int().min(60).max(1440),
  controllers: z.number().int().min(1).max(16).optional(),
});

function makeCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.randomBytes(6);
  let o = "";
  for (let i = 0; i < 6; i++) o += a[b[i] % a.length];
  return o;
}

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "floorplan-reservations-create",
    limit: 6,
    windowMs: 10 * 60 * 1000,
    maxBytes: 4 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  const v = parsed.data;

  const start = new Date(v.startAt);
  if (isNaN(start.getTime()) || start.getTime() < Date.now() - 2 * 60 * 1000) {
    return NextResponse.json({ error: "bad_start_time" }, { status: 400 });
  }
  const ends = new Date(start.getTime() + v.durationMin * 60 * 1000);
  const isFuture = start.getTime() > Date.now() + 5 * 60 * 1000;

  const supabase = getSupabaseAdmin();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, slug, is_published")
    .eq("id", v.branchId)
    .maybeSingle();
  if (!branch || !branch.is_published) {
    return NextResponse.json({ error: "branch_not_available" }, { status: 400 });
  }

  const { data: el } = await supabase
    .from("branch_floorplan_elements")
    .select("idx, label, reservable, accept_online, accept_advance, billing_mode, rate_per_hour, min_order_amount, included_controllers, extra_controller_price, max_controllers")
    .eq("branch_id", v.branchId)
    .eq("idx", v.elementIdx)
    .maybeSingle();
  if (!el || !el.reservable || !el.accept_online) {
    return NextResponse.json({ error: "spot_not_reservable" }, { status: 400 });
  }
  if (isFuture && !el.accept_advance) {
    return NextResponse.json({ error: "advance_not_allowed" }, { status: 400 });
  }

  // No double-book: reject overlap with another pending/confirmed online reservation on this spot.
  const { data: clash } = await supabase
    .from("floorplan_reservations")
    .select("id, start_at, ends_at")
    .eq("branch_id", v.branchId)
    .eq("element_idx", v.elementIdx)
    .in("status", ["pending", "confirmed"]);
  for (const c of clash ?? []) {
    const cs = new Date(c.start_at as string).getTime();
    const ce = new Date(c.ends_at as string).getTime();
    if (!(ends.getTime() <= cs || start.getTime() >= ce)) {
      return NextResponse.json({ error: "time_unavailable" }, { status: 409 });
    }
  }

  const isPaid = el.billing_mode === "time_rate";
  // Controllers: clamp to the element's config (default = included count, cap = max_controllers); each
  // controller beyond the included count adds a flat surcharge to the base (time_rate) price.
  const inc = Number(el.included_controllers) || 0;
  const extraCtrlPrice = Number(el.extra_controller_price) || 0;
  const maxCtrl = Number(el.max_controllers) || 0;
  let controllers = Math.max(1, v.controllers || Math.max(1, inc));
  if (maxCtrl > 0) controllers = Math.min(controllers, maxCtrl);
  const ctrlSurcharge = Math.max(0, controllers - inc) * extraCtrlPrice;
  const amountPhp = isPaid
    ? Math.round(((Number(el.rate_per_hour) || 0) * (v.durationMin / 60) + ctrlSurcharge) * 100) / 100
    : 0;
  const minOrder = el.billing_mode === "min_order" ? Number(el.min_order_amount) || 0 : 0;
  const code = makeCode();

  const baseRow = {
    branch_id: v.branchId,
    element_idx: v.elementIdx,
    element_label: el.label || "",
    billing_mode: el.billing_mode,
    customer_name: v.customerName,
    customer_contact: v.customerContact || null,
    start_at: start.toISOString(),
    duration_min: v.durationMin,
    ends_at: ends.toISOString(),
    amount_php: amountPhp,
    min_order_php: minOrder,
    controllers,
    reservation_code: code,
  };

  // Dining-table PLEDGE — confirm immediately, no payment.
  if (!isPaid) {
    const { data: created, error } = await supabase
      .from("floorplan_reservations")
      .insert({ ...baseRow, status: "confirmed", payment_status: "unpaid" })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "save_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, paid: false, reservationId: created.id, reservationCode: code, minOrder });
  }

  // PS5 (time_rate) PREPAY — needs the branch's PayMongo, then a hosted checkout.
  const config = await getBranchPaymentConfig(v.branchId);
  if (!isPaymongoReservationActive(config)) {
    return NextResponse.json({ error: "online_payment_unavailable" }, { status: 403 });
  }
  if (amountPhp <= 0) return NextResponse.json({ error: "no_rate_set" }, { status: 400 });

  const { data: created, error } = await supabase
    .from("floorplan_reservations")
    .insert({ ...baseRow, status: "pending", payment_status: "unpaid" })
    .select("id")
    .single();
  if (error || !created) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  try {
    const checkout = await createCheckoutSession({
      amountPhp,
      description: `Comffee reservation · ${branch.name} · ${el.label}`,
      lineItemName: `${el.label} (${v.durationMin} min)`,
      paymentMethodTypes: bookingPaymentMethods(amountPhp),
      successUrl: `${siteUrl()}/branches/${branch.slug}?reserved=1`,
      cancelUrl: `${siteUrl()}/branches/${branch.slug}`,
      remarks: `floorplan_reservation:${created.id}`,
      secretKey: config!.paymongo_secret_key!,
    });
    await supabase
      .from("floorplan_reservations")
      .update({
        paymongo_intent_id: checkout.id,
        paymongo_payment_intent_id: checkout.payment_intent_id,
      })
      .eq("id", created.id);
    return NextResponse.json({ ok: true, paid: true, reservationId: created.id, reservationCode: code, checkoutUrl: checkout.checkout_url });
  } catch (e) {
    await supabase.from("floorplan_reservations").delete().eq("id", created.id);
    return NextResponse.json({ error: "checkout_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}
