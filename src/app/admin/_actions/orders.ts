"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth/require-admin";

const VALID_STATUSES = ["placed", "preparing", "ready", "served", "cancelled"] as const;
type OrderStatus = (typeof VALID_STATUSES)[number];

function bumpAll(id?: string) {
  revalidatePath("/admin/orders");
  if (id) revalidatePath(`/admin/orders/${id}`);
}

export async function setOrderStatusAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  if (!id || !VALID_STATUSES.includes(status)) {
    redirect("/admin/orders?error=invalid");
  }
  await supabase.from("orders").update({ status }).eq("id", id);
  bumpAll(id);
  redirect(`/admin/orders/${id}?ok=${status}`);
}

export async function manualMarkPaidAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase.from("orders").update({ payment_status: "paid" }).eq("id", id);
  bumpAll(id);
  redirect(`/admin/orders/${id}?ok=paid`);
}

export async function deleteOrderAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase.from("orders").delete().eq("id", id);
  bumpAll();
  redirect("/admin/orders?ok=deleted");
}
