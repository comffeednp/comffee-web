import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Auto-provision a Comffee partner when they avail a package.
 *
 * Creates the partner's branch (type='cafe' = internet café w/ live PC seating,
 * the Comffee Clockwork page) + a `partner` admin account, with a per-branch
 * pc_sync_token the counter uses to push live seating. Branch is is_published=false
 * so the partner reviews + customizes (photos, rates, hours) before going live.
 *
 * Auth: super_admin for now (owner provisions). A PayMongo-webhook trigger can
 * call this same logic once the subscription billing event is wired.
 */

async function requireSuperAdminApi() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!admin || (admin as { role?: string }).role !== "super_admin") return null;
  return { id: (admin as { id: string }).id, email: user.email ?? null };
}

export async function POST(request: Request) {
  const me = await requireSuperAdminApi();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { email?: string; branchName?: string; package?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const branchName = (body.branchName ?? "").trim();
  const pkg = (body.package ?? "clockwork").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!branchName) return NextResponse.json({ error: "branch_name_required" }, { status: 400 });
  if (pkg !== "clockwork" && pkg !== "pos") {
    return NextResponse.json({ error: "invalid_package" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Email must not already belong to an admin/partner.
  const { data: existingAdmin } = await db
    .from("admin_users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingAdmin) {
    return NextResponse.json(
      { error: "already_admin", detail: "That email already belongs to an admin or partner." },
      { status: 400 },
    );
  }

  // Resolve a unique slug.
  const baseSlug = slugify(branchName) || "branch";
  let slug = baseSlug;
  for (let n = 1; ; n++) {
    const { data: clash } = await db.from("branches").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    if (n > 50) return NextResponse.json({ error: "slug_unavailable" }, { status: 400 });
    slug = `${baseSlug}-${n}`;
  }

  // Both packages provision a 'cafe' page (internet café + live PC seating); a
  // 'pos'/retail partner simply leaves the PC grid empty until they add stations.
  const pcSyncToken = crypto.randomBytes(24).toString("base64url");
  const { data: branch, error: brErr } = await db
    .from("branches")
    .insert({
      name: branchName,
      slug,
      type: "cafe",
      is_published: false,
      pc_sync_token: pcSyncToken,
      provisioned_package: pkg,
    })
    .select("id, slug")
    .single();
  if (brErr || !branch) {
    return NextResponse.json(
      { error: "branch_create_failed", detail: brErr?.message ?? "could not create branch" },
      { status: 400 },
    );
  }
  const branchId = (branch as { id: string }).id;
  const branchSlug = (branch as { slug: string }).slug;

  // Partner login.
  const tempPassword = crypto.randomBytes(9).toString("base64url");
  const { data: created, error: uErr } = await db.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (uErr || !created?.user) {
    await db.from("branches").delete().eq("id", branchId); // don't orphan the branch
    return NextResponse.json(
      { error: "user_create_failed", detail: uErr?.message ?? "could not create login" },
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
    await db.auth.admin.deleteUser(created.user.id).catch(() => {});
    await db.from("branches").delete().eq("id", branchId);
    return NextResponse.json({ error: "partner_create_failed", detail: insErr.message }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return NextResponse.json({
    ok: true,
    branchId,
    slug: branchSlug,
    package: pkg,
    email,
    tempPassword,
    pcSyncToken, // give this to the partner's counter so it can push live seating
    publicUrl: base ? `${base}/branches/${branchSlug}` : `/branches/${branchSlug}`,
  });
}
