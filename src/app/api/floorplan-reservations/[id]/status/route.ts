import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getBranchPaymentConfig } from "@/lib/branch-payment-config";
import { settleFloorplanRow, type FpPendingRow } from "@/lib/floorplan-settle";

export const runtime = "nodejs";

// Floor-plan reservation status — polled by the branch page when PayMongo returns the customer
// (?fr=<id> on the success URL). This is what actually CONFIRMS a paid PS5 booking: per-branch
// PayMongo accounts can't sign our platform webhook, so this route (and the 10-min cron sweep)
// verifies the checkout session server-side with the branch owner's key and flips
// pending→confirmed. Auth is by reservation UUID, same posture as pc-reservations/claim-paid:
// the customer just created it, it's unguessable, and the response has no customer PII beyond
// what that customer typed themselves.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const select =
    "id, branch_id, status, payment_status, paymongo_intent_id, created_at, reservation_code, element_label, billing_mode, start_at, duration_min, amount_php, min_order_php";
  const { data: row } = await admin
    .from("floorplan_reservations")
    .select(select)
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let status = row.status as string;
  if (status === "pending" && row.payment_status === "unpaid") {
    const config = await getBranchPaymentConfig(row.branch_id as string);
    status = await settleFloorplanRow(
      row as FpPendingRow,
      config?.paymongo_secret_key ?? null,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status, // 'pending' | 'confirmed' | 'expired' | 'cancelled'
      reservationCode: status === "confirmed" ? row.reservation_code : null,
      elementLabel: row.element_label,
      startAt: row.start_at,
      durationMin: row.duration_min,
      amountPhp: Number(row.amount_php) || 0,
      minOrderPhp: Number(row.min_order_php) || 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
