import { getSupabaseServer } from "@/lib/supabase/server";
import { getAdminScope } from "@/lib/auth/require-admin";
import { listSavedReplies } from "@/lib/saved-replies";
import SavedRepliesManager from "./SavedRepliesManager";

export const dynamic = "force-dynamic";

export default async function SavedRepliesPage() {
  const { branchId } = await getAdminScope();
  const supabase = await getSupabaseServer();

  const { data: branchRows } = await supabase
    .from("branches")
    .select("id, name")
    .order("sort_order");
  const replies = await listSavedReplies(branchId);

  return (
    <section className="container-edge py-12 max-w-3xl">
      <p className="terminal-label">/saved-replies</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">Saved replies</h1>
      <p className="mt-2 text-sm text-cream-dim">
        Canned messages with attachments to quickly send guests their details. Add, edit, and delete right here — pick a branch so a reply only shows in that branch&rsquo;s chats.
      </p>

      <SavedRepliesManager initialReplies={replies} branches={branchRows ?? []} />
    </section>
  );
}
