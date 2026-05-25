import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Only the owner (super_admin) may manage partner accounts. */
async function requireSuperAdminApi() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!admin || (admin as { role?: string }).role !== "super_admin") return null;
  return { id: (admin as { id: string }).id, role: (admin as { role: string }).role, email: user.email ?? null };
}

export async function GET() {
  if (!(await requireSuperAdminApi())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("admin_users")
    .select("id, full_name, email, is_active, created_at, branch_id, branch:branches(name)")
    .eq("role", "partner")
    .order("created_at", { ascending: false });
  const { data: branches } = await db.from("branches").select("id, name").order("name");
  return NextResponse.json({ ok: true, partners: data ?? [], branches: branches ?? [] });
}

export async function POST(request: Request) {
  const me = await requireSuperAdminApi();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { email?: string; branchId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const branchId = (body.branchId ?? "").trim();
  if (!branchId) return NextResponse.json({ error: "branch_required" }, { status: 400 });

  // Never add your own admin email, or one that already belongs to an admin/partner.
  if (me.email && email === me.email.toLowerCase()) {
    return NextResponse.json({ error: "cannot_add_self", detail: "That's your own admin email — you can't add yourself as a partner." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: existingAdmin } = await db
    .from("admin_users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingAdmin) {
    return NextResponse.json({ error: "already_admin", detail: "That email already belongs to an admin or partner." }, { status: 400 });
  }
  const { data: branch } = await db.from("branches").select("id").eq("id", branchId).maybeSingle();
  if (!branch) return NextResponse.json({ error: "invalid_branch" }, { status: 400 });
  const tempPassword = crypto.randomBytes(9).toString("base64url"); // ~12 chars
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (error || !created?.user) {
    return NextResponse.json(
      { error: "create_failed", detail: error?.message ?? "could not create login (email may already be in use)" },
      { status: 400 },
    );
  }
  const { error: insErr } = await db.from("admin_users").insert({
    auth_user_id: created.user.id,
    full_name: email.split("@")[0],
    email,
    role: "partner",
    branch_id: branchId,
    is_active: true,
  });
  if (insErr) {
    await db.auth.admin.deleteUser(created.user.id).catch(() => {}); // don't orphan the auth user
    return NextResponse.json({ error: "create_failed", detail: insErr.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, email, tempPassword });
}

export async function DELETE(request: Request) {
  if (!(await requireSuperAdminApi())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: partner } = await db
    .from("admin_users")
    .select("auth_user_id, role")
    .eq("id", id)
    .maybeSingle();
  if (!partner || (partner as { role?: string }).role !== "partner") {
    return NextResponse.json({ error: "not_a_partner" }, { status: 400 });
  }
  await db.from("admin_users").delete().eq("id", id);
  const authId = (partner as { auth_user_id?: string }).auth_user_id;
  if (authId) await db.auth.admin.deleteUser(authId).catch(() => {});
  return NextResponse.json({ ok: true });
}
