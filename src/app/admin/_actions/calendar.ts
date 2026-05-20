"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function createManualBlockAction(
  branchId: string,
  checkIn: string,
  checkOut: string,
  notes = "Manual block",
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!branchId || !checkIn || !checkOut) return { error: "Missing fields" };
  if (checkIn >= checkOut) return { error: "check-out must be after check-in" };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("reservations").insert({
    branch_id: branchId,
    source: "manual_block",
    status: "confirmed",
    check_in: checkIn,
    check_out: checkOut,
    guest_name: "Manual block",
    notes,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/calendar");
  return {};
}

export async function unblockAction(reservationId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = getSupabaseAdmin();

  const { data, error: fetchError } = await supabase
    .from("reservations")
    .select("source")
    .eq("id", reservationId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!data) return { error: "Reservation not found" };
  if (data.source !== "manual_block") return { error: "Only manual blocks can be removed here" };

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId);

  if (error) return { error: error.message };
  revalidatePath("/admin/calendar");
  return {};
}
