"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth/require-admin";

function bump() {
  revalidatePath("/admin/saved-replies");
  revalidatePath("/admin/chat");
}

export async function createSavedReplyAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const branchRaw = String(formData.get("branch_id") ?? "").trim();
  const branch_id = branchRaw || null; // "" = all branches
  if (!title || !body) {
    redirect("/admin/saved-replies?error=" + encodeURIComponent("Title and message are required"));
  }

  const urls = formData.getAll("attachments").map((v) => String(v)).filter(Boolean);
  const attachment_urls = urls.map((url, i) => ({
    url,
    label: decodeURIComponent((url.split("/").pop() ?? `attachment-${i + 1}`).split("-").slice(1).join("-") || `attachment-${i + 1}`),
  }));

  const { error } = await supabase.from("chat_saved_replies").insert({
    branch_id,
    title,
    body,
    attachment_urls,
  });
  if (error) {
    redirect("/admin/saved-replies?error=" + encodeURIComponent(error.message));
  }
  bump();
  redirect("/admin/saved-replies?ok=created");
}

export async function deleteSavedReplyAction(formData: FormData) {
  await requireEditor();
  const supabase = await getSupabaseServer();
  const id = String(formData.get("id") ?? "");
  if (id) await supabase.from("chat_saved_replies").delete().eq("id", id);
  bump();
  redirect("/admin/saved-replies?ok=deleted");
}
