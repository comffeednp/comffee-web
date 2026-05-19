import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { guardMutating } from "@/lib/security";
import { createPaymentLink, isPaymongoConfigured } from "@/lib/paymongo";

export const runtime = "nodejs";

const schema = z.object({
  branchId: z.string().uuid(),
  memberNumber: z.string().min(1).max(60),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional().or(z.literal("")),
  customerEmail: z.string().email().optional().or(z.literal("")),
  amountPhp: z.number().positive().min(20).max(10000),
});

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "topup-create",
    limit: 5,
    windowMs: 10 * 60 * 1000,
    maxBytes: 4 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }
  const v = parsed.data;

  // Round amount to integer pesos
  const amountPhp = Math.floor(v.amountPhp);
  if (amountPhp < 20 || amountPhp > 10000) {
    return NextResponse.json({ error: "amount_out_of_range" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verify branch exists + is a cafe
  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, type")
    .eq("id", v.branchId)
    .maybeSingle();
  if (!branch || branch.type !== "cafe") {
    return NextResponse.json({ error: "branch_not_found" }, { status: 400 });
  }

  // Insert pending topup row
  const { data: topup, error: insertErr } = await supabase
    .from("member_topups")
    .insert({
      branch_id: v.branchId,
      member_number: v.memberNumber,
      customer_name: v.customerName,
      customer_phone: v.customerPhone || null,
      customer_email: v.customerEmail || null,
      amount_php: amountPhp,
      payment_status: "unpaid",
      fulfillment_status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !topup) {
    console.error("topup insert failed", insertErr?.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Dev mode — mark as paid immediately
  if (!isPaymongoConfigured()) {
    await supabase
      .from("member_topups")
      .update({ payment_status: "paid" })
      .eq("id", topup.id);
    return NextResponse.json({
      ok: true,
      simulated: true,
      topupId: topup.id,
    });
  }

  // Real PayMongo flow
  try {
    const link = await createPaymentLink({
      amountPhp,
      description: `Comffee member top-up @ ${branch.name} · #${v.memberNumber}`,
      remarks: `topup:${topup.id}`,
    });
    await supabase
      .from("member_topups")
      .update({
        paymongo_intent_id: link.id,
        payment_status: "pending",
      })
      .eq("id", topup.id);
    return NextResponse.json({
      ok: true,
      topupId: topup.id,
      checkoutUrl: link.checkout_url,
    });
  } catch (e) {
    console.error("paymongo error (topup)", e);
    // Roll back the topup row
    await supabase.from("member_topups").delete().eq("id", topup.id);
    return NextResponse.json(
      {
        error: "payment_link_failed",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 502 },
    );
  }
}
