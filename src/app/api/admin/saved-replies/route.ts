import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function requireEditorApi() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const a = admin as { id: string; role: string } | null;
  if (!a || a.role === "partner") return null;
  return a;
}

const attachmentSchema = z.array(z.object({ url: z.string().url(), label: z.string().max(200) })).max(10).default([]);
const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  attachment_urls: attachmentSchema,
});

/** GET — all saved replies (admin-internal). */
export async function GET() {
  if (!(await requireEditorApi())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chat_saved_replies")
    .select("*")
    .order("branch_id", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, replies: data ?? [] });
}

/** POST — create. */
export async function POST(request: Request) {
  if (!(await requireEditorApi())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { id: _ignore, ...fields } = parsed.data;
  void _ignore;
  const { data, error } = await supabase
    .from("chat_saved_replies")
    .insert({ ...fields, branch_id: fields.branch_id ?? null })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reply: data });
}

/** PATCH — update in place. */
export async function PATCH(request: Request) {
  if (!(await requireEditorApi())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.id) return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { id, ...fields } = parsed.data;
  const { data, error } = await supabase
    .from("chat_saved_replies")
    .update({ ...fields, branch_id: fields.branch_id ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reply: data });
}

/** DELETE — ?id=. */
export async function DELETE(request: Request) {
  if (!(await requireEditorApi())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("chat_saved_replies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
