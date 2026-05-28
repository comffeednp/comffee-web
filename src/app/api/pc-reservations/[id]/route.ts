import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Stage 7a: tiny read endpoint the customer's confirmation page polls every 4s while waiting
// for the partner to verify payment. Returns only the two status fields — no PII. Auth is by
// possession of the reservation UUID (the customer just created it).

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("pc_reservations")
    .select("status, payment_status, payment_hold_expires_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
