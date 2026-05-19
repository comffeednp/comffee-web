import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { issueRefund } from "@/lib/refunds";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const schema = z
  .object({
    orderId: z.string().uuid().optional(),
    reservationId: z.string().uuid().optional(),
    amountPhp: z.number().positive(),
    reason: z.string().min(1).max(500),
  })
  .refine((v) => !!(v.orderId || v.reservationId), {
    message: "must specify orderId or reservationId",
  });

export async function POST(request: Request) {
  // Auth
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await issueRefund({
      orderId: parsed.data.orderId,
      reservationId: parsed.data.reservationId,
      amountPhp: parsed.data.amountPhp,
      reason: parsed.data.reason,
      adminId: admin.id,
    });

    if (parsed.data.orderId) {
      revalidatePath(`/admin/orders/${parsed.data.orderId}`);
      revalidatePath("/admin/orders");
    }
    if (parsed.data.reservationId) {
      revalidatePath(`/admin/bookings/${parsed.data.reservationId}`);
      revalidatePath("/admin/bookings");
    }

    return NextResponse.json({ ok: true, refund: result });
  } catch (e) {
    console.error("refund failed", e);
    return NextResponse.json(
      { error: "refund_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
