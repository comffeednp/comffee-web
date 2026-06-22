import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface SavedReplyAttachment {
  url: string;
  label: string;
}

export interface SavedReply {
  id: string;
  branch_id: string | null;
  title: string;
  body: string;
  attachment_urls: SavedReplyAttachment[];
  sort_order: number;
  created_at: string;
}

/**
 * List saved replies an admin may use. Owners (branchId null) get all; a
 * branch-scoped admin gets that branch's replies plus shared (branch_id null)
 * ones. The chat composer further filters to the active conversation's branch.
 */
export async function listSavedReplies(branchId?: string | null): Promise<SavedReply[]> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("chat_saved_replies")
    .select("*")
    .order("branch_id", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true });
  if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`) as typeof q;
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ...(r as SavedReply),
    attachment_urls: Array.isArray((r as { attachment_urls?: unknown }).attachment_urls)
      ? ((r as { attachment_urls: SavedReplyAttachment[] }).attachment_urls)
      : [],
  }));
}
