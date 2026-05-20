"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { slugify } from "@/lib/utils";

function nullable(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

export async function createBranchAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/branches/new?error=name_required");

  const slug = slugify(String(formData.get("slug") ?? "") || name);
  const type = String(formData.get("type") ?? "cafe");

  const { data, error } = await supabase
    .from("branches")
    .insert({
      name,
      slug,
      type,
      tagline: nullable(formData.get("tagline")),
      address: nullable(formData.get("address")),
      city: nullable(formData.get("city")),
      phone: nullable(formData.get("phone")),
      email: nullable(formData.get("email")),
      lat: numOrNull(formData.get("lat")),
      lng: numOrNull(formData.get("lng")),
      description_md: nullable(formData.get("description_md")),
      hero_image_url: nullable(formData.get("hero_image_url")),
      hours_text: nullable(formData.get("hours_text")),
      max_guests: numOrNull(formData.get("max_guests")),
      sort_order: numOrNull(formData.get("sort_order")) ?? 999,
      is_published: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/admin/branches/new?error=${encodeURIComponent(error?.message ?? "create_failed")}`,
    );
  }

  revalidatePath("/admin/branches");
  revalidatePath("/branches");
  revalidatePath("/");
  redirect(`/admin/branches/${data!.id}`);
}

export async function updateBranchAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/branches?error=missing_id");

  const patch = {
    name: String(formData.get("name") ?? "").trim(),
    slug: slugify(String(formData.get("slug") ?? "")),
    type: String(formData.get("type") ?? "cafe"),
    tagline: nullable(formData.get("tagline")),
    address: nullable(formData.get("address")),
    city: nullable(formData.get("city")),
    phone: nullable(formData.get("phone")),
    email: nullable(formData.get("email")),
    lat: numOrNull(formData.get("lat")),
    lng: numOrNull(formData.get("lng")),
    description_md: nullable(formData.get("description_md")),
    hero_image_url: nullable(formData.get("hero_image_url")),
    hours_text: nullable(formData.get("hours_text")),
    max_guests: numOrNull(formData.get("max_guests")),
    booking_cutoff_time: nullable(formData.get("booking_cutoff_time")),
    sort_order: numOrNull(formData.get("sort_order")) ?? 999,
    is_published: formData.get("is_published") === "on",
  };

  const { error } = await supabase.from("branches").update(patch).eq("id", id);
  if (error) {
    redirect(`/admin/branches/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/admin/branches/${id}`);
  revalidatePath("/admin/branches");
  revalidatePath("/branches");
  revalidatePath(`/branches/${patch.slug}`);
  revalidatePath("/");
  redirect(`/admin/branches/${id}?ok=1`);
}

export async function deleteBranchAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/branches?error=missing_id");
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) redirect(`/admin/branches?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/branches");
  revalidatePath("/branches");
  revalidatePath("/");
  redirect("/admin/branches?deleted=1");
}

/* ---------- amenities ---------- */
export async function addAmenityAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const branch_id = String(formData.get("branch_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!branch_id || !label) return;
  await supabase.from("branch_amenities").insert({
    branch_id,
    label,
    icon: String(formData.get("icon") ?? "sparkles"),
    description: nullable(formData.get("description")),
    sort_order: numOrNull(formData.get("sort_order")) ?? 0,
  });
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
}

export async function updateAmenityAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const branch_id = String(formData.get("branch_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!id || !branch_id || !label) return;
  await supabase.from("branch_amenities").update({
    icon: String(formData.get("icon") ?? "sparkles"),
    label,
    description: nullable(formData.get("description")),
    sort_order: numOrNull(formData.get("sort_order")) ?? 0,
  }).eq("id", id);
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
}

export async function deleteAmenityAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const branch_id = String(formData.get("branch_id") ?? "");
  await supabase.from("branch_amenities").delete().eq("id", id);
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
}

/* ---------- rates ---------- */
export async function addRateAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const branch_id = String(formData.get("branch_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!branch_id || !label) return;
  const { error } = await supabase.from("branch_rates").insert({
    branch_id,
    label,
    category: String(formData.get("category") ?? "general"),
    description: nullable(formData.get("description")),
    price_php: numOrNull(formData.get("price_php")) ?? 0,
    unit: String(formData.get("unit") ?? "hour"),
    sort_order: numOrNull(formData.get("sort_order")) ?? 0,
    max_pax: numOrNull(formData.get("max_pax")),
    max_guests: numOrNull(formData.get("max_guests")),
    extra_pax_fee_php: numOrNull(formData.get("extra_pax_fee_php")),
    check_in_time: nullable(formData.get("check_in_time")),
    check_out_time: nullable(formData.get("check_out_time")),
  });
  if (error) redirect(`/admin/branches/${branch_id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
}

export async function updateRateAction(formData: FormData): Promise<{ error: string } | undefined> {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const branch_id = String(formData.get("branch_id") ?? "");
  if (!id || !branch_id) return { error: "missing_id" };
  const { error } = await supabase.from("branch_rates").update({
    label: String(formData.get("label") ?? "").trim(),
    category: String(formData.get("category") ?? "general"),
    description: nullable(formData.get("description")),
    price_php: numOrNull(formData.get("price_php")) ?? 0,
    unit: String(formData.get("unit") ?? "hour"),
    sort_order: numOrNull(formData.get("sort_order")) ?? 0,
    max_pax: numOrNull(formData.get("max_pax")),
    max_guests: numOrNull(formData.get("max_guests")),
    extra_pax_fee_php: numOrNull(formData.get("extra_pax_fee_php")),
    check_in_time: nullable(formData.get("check_in_time")),
    check_out_time: nullable(formData.get("check_out_time")),
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
}

export async function deleteRateAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const branch_id = String(formData.get("branch_id") ?? "");
  await supabase.from("branch_rates").delete().eq("id", id);
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
}

/* ---------- photos ---------- */
export async function addPhotosAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const branch_id = String(formData.get("branch_id") ?? "");
  const urls = formData.getAll("public_url").map(String).filter(Boolean);
  if (!branch_id || !urls.length) return;
  const base = numOrNull(formData.get("sort_order_start")) ?? 0;
  await supabase.from("branch_photos").insert(
    urls.map((url, i) => ({
      branch_id,
      public_url: url,
      storage_path: `external/${Date.now()}_${i}`,
      caption: null,
      sort_order: base + i,
    }))
  );
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
  redirect(`/admin/branches/${branch_id}?ok=1`);
}

export async function addPhotoAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const branch_id = String(formData.get("branch_id") ?? "");
  const public_url = String(formData.get("public_url") ?? "").trim();
  if (!branch_id || !public_url) redirect(`/admin/branches/${branch_id}?error=missing_fields`);
  await supabase.from("branch_photos").insert({
    branch_id,
    public_url,
    storage_path: String(formData.get("storage_path") ?? `external/${Date.now()}`),
    caption: nullable(formData.get("caption")),
    sort_order: numOrNull(formData.get("sort_order")) ?? 0,
  });
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
  redirect(`/admin/branches/${branch_id}#photos`);
}

export async function deletePhotoAction(formData: FormData) {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const branch_id = String(formData.get("branch_id") ?? "");
  await supabase.from("branch_photos").delete().eq("id", id);
  revalidatePath(`/admin/branches/${branch_id}`);
  revalidatePath("/branches");
}
