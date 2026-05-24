"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth/require-admin";

export async function markHandledAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase
    .from("contact_form_submissions")
    .update({ handled: true, handled_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/admin/contact-submissions");
  redirect("/admin/contact-submissions");
}

export async function deleteSubmissionAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  await supabase.from("contact_form_submissions").delete().eq("id", id);
  revalidatePath("/admin/contact-submissions");
  redirect("/admin/contact-submissions");
}
