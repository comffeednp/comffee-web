"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

function bumpAll(id?: string) {
  revalidatePath("/admin/bookings");
  if (id) revalidatePath(`/admin/bookings/${id}`);
}

export async function manualConfirmAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") ?? "");
  await supabase
    .from("reservations")
    .update({ status: "confirmed", hold_expires_at: null })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/bookings/${id}?ok=confirmed`);
}

export async function cancelBookingAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "cancelled by admin");
  await supabase
    .from("reservations")
    .update({ status: "cancelled", notes: reason })
    .eq("id", id);
  bumpAll(id);
  redirect(`/admin/bookings/${id}?ok=cancelled`);
}

export async function manualBlockAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const branch_id = String(formData.get("branch_id") ?? "");
  const check_in = String(formData.get("check_in") ?? "");
  const check_out = String(formData.get("check_out") ?? "");
  const notes = String(formData.get("notes") ?? "manual block");

  if (!branch_id || !check_in || !check_out) {
    redirect("/admin/bookings?error=missing_fields");
  }

  const { error } = await supabase.from("reservations").insert({
    branch_id,
    source: "manual_block",
    status: "confirmed",
    check_in,
    check_out,
    guest_name: "Manual block",
    notes,
  });
  if (error) {
    redirect(`/admin/bookings?error=${encodeURIComponent(error.message)}`);
  }
  bumpAll();
  redirect("/admin/bookings");
}
