import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Approve a pending branch-edit submission. Admin clicks "Approve" on the inline panel at
// /admin/branches/<id>; this endpoint applies the JSONB payload to the real branch tables.
//
// Strategy: sequential writes (no Postgres function) — simpler to ship and the failure surface
// is bounded (you're the only admin, you'd see the error). On partial-state failures, the
// submission stays 'pending' so a retry is safe.
//
// What gets applied:
//   - branches row (update existing OR insert new from proposedSlug)
//   - branch_photos / branch_amenities / branch_rates — REPLACE (delete all + insert from payload)
//
// [[comffee-saas-vision]] Stage 4a.

interface PayloadPhoto {
  storage_path?: string;
  public_url?: string;
  caption?: string;
  sort_order?: number;
}
interface PayloadAmenity {
  icon?: string;
  label?: string;
  description?: string | null;
  sort_order?: number;
}
interface PayloadRate {
  category?: string;
  label?: string;
  description?: string | null;
  price_php?: number;
  unit?: string;
  sort_order?: number;
}
interface Payload {
  name?: string;
  type?: string;
  tagline?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  lat?: number | null;
  lng?: number | null;
  description_md?: string | null;
  hours_text?: string | null;
  hero_image_url?: string | null;
  is_published?: boolean;
  reservations_enabled?: boolean;
  photos?: PayloadPhoto[];
  amenities?: PayloadAmenity[];
  rates?: PayloadRate[];
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Admin auth — must be signed in as an active admin, and not a read-only partner.
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

  const admin = getSupabaseAdmin();

  // Load the pending submission.
  const { data: sub, error: subErr } = await admin
    .from("branch_edit_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (subErr || !sub) {
    return NextResponse.json({ ok: false, error: "submission_not_found" }, { status: 404 });
  }
  if (sub.status !== "pending") {
    return NextResponse.json({ ok: false, error: "already_reviewed", status: sub.status }, { status: 409 });
  }
  const payload = sub.payload as Payload;

  // 1) Branches row: update existing or insert new.
  let branchId: string | null = sub.branch_id;
  if (branchId) {
    const update: Record<string, unknown> = {};
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.tagline !== undefined) update.tagline = payload.tagline;
    if (payload.address !== undefined) update.address = payload.address;
    if (payload.city !== undefined) update.city = payload.city;
    if (payload.phone !== undefined) update.phone = payload.phone;
    if (payload.email !== undefined) update.email = payload.email;
    if (payload.lat !== undefined) update.lat = payload.lat;
    if (payload.lng !== undefined) update.lng = payload.lng;
    if (payload.description_md !== undefined) update.description_md = payload.description_md;
    if (payload.hours_text !== undefined) update.hours_text = payload.hours_text;
    if (payload.hero_image_url !== undefined) update.hero_image_url = payload.hero_image_url;
    if (payload.is_published !== undefined) update.is_published = payload.is_published;
    if (payload.reservations_enabled !== undefined) update.reservations_enabled = payload.reservations_enabled;
    update.updated_at = new Date().toISOString();
    const { error: upErr } = await admin.from("branches").update(update).eq("id", branchId);
    if (upErr) {
      return NextResponse.json({ ok: false, error: "branch_update_failed", detail: upErr.message }, { status: 500 });
    }
  } else if (sub.proposed_slug) {
    // NEW branch — defaults type to 'partner_cafe' (the SaaS path) unless explicitly set
    const { data: created, error: insErr } = await admin
      .from("branches")
      .insert({
        slug: sub.proposed_slug,
        name: payload.name ?? sub.proposed_slug,
        type: (payload.type as "cafe" | "playcation" | "partner_cafe") ?? "partner_cafe",
        tagline: payload.tagline ?? null,
        address: payload.address ?? null,
        city: payload.city ?? null,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        description_md: payload.description_md ?? null,
        hours_text: payload.hours_text ?? null,
        hero_image_url: payload.hero_image_url ?? null,
        is_published: payload.is_published ?? true,
        reservations_enabled: payload.reservations_enabled ?? false,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json({ ok: false, error: "branch_create_failed", detail: insErr?.message }, { status: 500 });
    }
    branchId = created.id;
  } else {
    return NextResponse.json({ ok: false, error: "submission_has_no_target" }, { status: 400 });
  }

  // 2) Replace photos/amenities/rates. DELETE-then-INSERT is simpler than diffing; OK because
  //    the payload always carries the FULL list (read-only stage's POS already pulls the full set
  //    and edits it as one block).
  if (Array.isArray(payload.photos)) {
    await admin.from("branch_photos").delete().eq("branch_id", branchId);
    if (payload.photos.length) {
      await admin.from("branch_photos").insert(
        payload.photos.map((p, i) => ({
          branch_id: branchId,
          storage_path: p.storage_path ?? "",
          public_url: p.public_url ?? null,
          caption: p.caption ?? null,
          sort_order: p.sort_order ?? i,
        })),
      );
    }
  }
  if (Array.isArray(payload.amenities)) {
    await admin.from("branch_amenities").delete().eq("branch_id", branchId);
    if (payload.amenities.length) {
      await admin.from("branch_amenities").insert(
        payload.amenities.map((a, i) => ({
          branch_id: branchId,
          icon: a.icon ?? "sparkles",
          label: a.label ?? "",
          description: a.description ?? null,
          sort_order: a.sort_order ?? i,
        })),
      );
    }
  }
  if (Array.isArray(payload.rates)) {
    await admin.from("branch_rates").delete().eq("branch_id", branchId);
    if (payload.rates.length) {
      await admin.from("branch_rates").insert(
        payload.rates.map((r, i) => ({
          branch_id: branchId,
          category: r.category ?? "internet",
          label: r.label ?? "",
          description: r.description ?? null,
          price_php: r.price_php ?? 0,
          unit: r.unit ?? "hour",
          sort_order: r.sort_order ?? i,
        })),
      );
    }
  }

  // 3) Mark submission approved + bind to branchId (covers the "new branch" case where
  //    branch_id was null before).
  await admin
    .from("branch_edit_submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUser.id,
      branch_id: branchId,
    })
    .eq("id", id);

  // Refresh the public pages that may have changed (their slug → page revalidation).
  revalidatePath("/branches");
  revalidatePath("/partners");
  if (branchId) {
    // Need slug for the path — quick lookup
    const { data: b } = await admin.from("branches").select("slug, type").eq("id", branchId).maybeSingle();
    if (b?.slug) {
      revalidatePath(`/branches/${b.slug}`);
      if (b.type === "partner_cafe") revalidatePath(`/partners/${b.slug}`);
    }
  }
  revalidatePath(`/admin/branches/${branchId}`);

  return NextResponse.json({ ok: true, branchId });
}
