import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Stage 7b: cashier rejects a claim_paid reservation (GCash receipt didn't arrive, amount didn't
// match, etc.). Sets status='cancelled' + records the reason in notes for audit. Bearer-token
// auth — POS uses the service-role key.

const schema = z.object({
  reason: z.string().min(1).max(200),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("pc_reservations")
    .select("status, notes")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (row.status !== "pending") {
    return NextResponse.json({ ok: false, error: `bad_status:${row.status}` }, { status: 409 });
  }

  const note = `[rejected by POS] ${parsed.data.reason}`;
  const mergedNotes = row.notes ? `${row.notes}\n${note}` : note;
  const { error: upErr } = await admin
    .from("pc_reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      notes: mergedNotes,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (upErr) {
    return NextResponse.json({ ok: false, error: "save_failed", detail: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
