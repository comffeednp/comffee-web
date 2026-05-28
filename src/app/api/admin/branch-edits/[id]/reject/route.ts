import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Reject a pending branch-edit submission. Admin clicks "Reject" inline at /admin/branches/<id>
// and gives a short note — the owner sees the note the next time they open the POS Reservation
// tab. No changes applied to branches/photos/amenities/rates. [[comffee-saas-vision]] Stage 4a.

const schema = z.object({
  note: z.string().min(1, "tell the owner why").max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Admin auth (no read-only partners — same gate as approve).
  const supa = await getSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: adminUser } = await supa
    .from("admin_users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!adminUser) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if ((adminUser as { role?: string }).role === "partner") {
    return NextResponse.json({ ok: false, error: "read_only" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation", detail: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: sub, error: subErr } = await admin
    .from("branch_edit_submissions")
    .select("status, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (subErr || !sub) return NextResponse.json({ ok: false, error: "submission_not_found" }, { status: 404 });
  if (sub.status !== "pending") {
    return NextResponse.json({ ok: false, error: "already_reviewed", status: sub.status }, { status: 409 });
  }

  const { error: upErr } = await admin
    .from("branch_edit_submissions")
    .update({
      status: "rejected",
      rejection_note: parsed.data.note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUser.id,
    })
    .eq("id", id);
  if (upErr) {
    return NextResponse.json({ ok: false, error: "save_failed", detail: upErr.message }, { status: 500 });
  }

  if (sub.branch_id) revalidatePath(`/admin/branches/${sub.branch_id}`);
  return NextResponse.json({ ok: true });
}
