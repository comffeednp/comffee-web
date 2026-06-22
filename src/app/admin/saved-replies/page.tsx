import { getSupabaseServer } from "@/lib/supabase/server";
import { getAdminScope } from "@/lib/auth/require-admin";
import { listSavedReplies } from "@/lib/saved-replies";
import { createSavedReplyAction, deleteSavedReplyAction } from "../_actions/saved-replies";
import ImageUpload from "@/components/admin/ImageUpload";
import { MessageSquarePlus, Trash2, Paperclip } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function SavedRepliesPage({ searchParams }: Props) {
  const { branchId } = await getAdminScope();
  const { ok, error } = await searchParams;
  const supabase = await getSupabaseServer();

  const { data: branchRows } = await supabase
    .from("branches")
    .select("id, name")
    .order("sort_order");
  const branches = branchRows ?? [];
  const branchName = (id: string | null) =>
    id ? (branches.find((b) => b.id === id)?.name ?? "—") : "All branches";

  const replies = await listSavedReplies(branchId);

  return (
    <section className="container-edge py-12 max-w-3xl">
      <p className="terminal-label">/saved-replies</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">Saved replies</h1>
      <p className="mt-2 text-sm text-cream-dim">
        Canned messages with attachments to quickly send guests their details. Scoped per branch — pick a branch so a reply only shows in that branch&rsquo;s chats.
      </p>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// {ok}</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      {/* Create */}
      <form action={createSavedReplyAction} className="mt-8 p-6 border border-line-bright rounded-xl bg-bg-card space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="terminal-label">// branch</span>
            <select name="branch_id" className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber" defaultValue={branchId ?? ""}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="terminal-label">// title (for your reference)</span>
            <input name="title" required placeholder="e.g. Check-in details" className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber" />
          </label>
        </div>
        <label className="block">
          <span className="terminal-label">// message</span>
          <textarea name="body" required rows={4} placeholder="The message that gets sent to the guest…" className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber" />
        </label>
        <div>
          <span className="terminal-label">// attachments (optional)</span>
          <div className="mt-2">
            <ImageUpload name="attachments" folder="saved-replies" multiple />
          </div>
        </div>
        <button type="submit" className="inline-flex items-center gap-2 bg-amber text-bg rounded-md px-4 py-2 font-mono text-xs uppercase tracking-widest">
          <MessageSquarePlus className="h-4 w-4" /> Save reply
        </button>
      </form>

      {/* List */}
      <div className="mt-10 space-y-3">
        {replies.length === 0 && (
          <p className="font-mono text-xs text-mocha">// no saved replies yet</p>
        )}
        {replies.map((r) => (
          <div key={r.id} className="p-4 border border-line rounded-lg bg-bg flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-cream">{r.title}</span>
                <span className="font-mono text-[0.6rem] uppercase tracking-widest px-2 py-0.5 rounded bg-bg-elev border border-line text-mocha">{branchName(r.branch_id)}</span>
                {r.attachment_urls.length > 0 && (
                  <span className="inline-flex items-center gap-1 font-mono text-[0.6rem] text-mocha"><Paperclip className="h-3 w-3" />{r.attachment_urls.length}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-cream-dim whitespace-pre-line line-clamp-3">{r.body}</p>
            </div>
            <form action={deleteSavedReplyAction}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" title="Delete saved reply" className="text-red-400 hover:text-red-300 p-2">
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
