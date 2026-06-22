"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Paperclip, Plus, Pencil, X, ImagePlus } from "lucide-react";
import type { SavedReply, SavedReplyAttachment } from "@/lib/saved-replies";

interface Branch { id: string; name: string }

export default function SavedRepliesManager({
  initialReplies,
  branches,
}: {
  initialReplies: SavedReply[];
  branches: Branch[];
}) {
  const [replies, setReplies] = useState<SavedReply[]>(initialReplies);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<SavedReplyAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? "—") : "All branches");

  function resetForm() {
    setEditingId(null);
    setBranchId("");
    setTitle("");
    setBody("");
    setAttachments([]);
    setError(null);
  }

  function startEdit(r: SavedReply) {
    setEditingId(r.id);
    setBranchId(r.branch_id ?? "");
    setTitle(r.title);
    setBody(r.body);
    setAttachments(r.attachment_urls ?? []);
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const added: SavedReplyAttachment[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "saved-replies");
        const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
        if (r.ok) {
          const { public_url } = (await r.json()) as { public_url?: string };
          if (public_url) added.push({ url: public_url, label: file.name });
        }
      }
      setAttachments((a) => [...a, ...added]);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!title.trim() || !body.trim()) {
      setError("Title and message are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { id: editingId ?? undefined, branch_id: branchId || null, title: title.trim(), body: body.trim(), attachment_urls: attachments };
      const r = await fetch("/api/admin/saved-replies", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        setError("Couldn't save. Check the fields and try again.");
        return;
      }
      const { reply } = (await r.json()) as { reply: SavedReply };
      setReplies((prev) => (editingId ? prev.map((x) => (x.id === reply.id ? reply : x)) : [...prev, reply]));
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this saved reply?")) return;
    const r = await fetch(`/api/admin/saved-replies?id=${id}`, { method: "DELETE" });
    if (r.ok) {
      setReplies((prev) => prev.filter((x) => x.id !== id));
      if (editingId === id) resetForm();
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Add / edit form (always on this page — no navigation) */}
      <div className="p-6 border border-line-bright rounded-xl bg-bg-card space-y-4">
        <div className="flex items-center justify-between">
          <p className="terminal-label">{editingId ? "// edit reply" : "// new reply"}</p>
          {editingId && (
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-widest text-mocha hover:text-amber">
              <X className="h-3 w-3" /> cancel edit
            </button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="terminal-label">{"// branch"}</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="terminal-label">{"// title (for your reference)"}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Check-in details" className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber" />
          </label>
        </div>
        <label className="block">
          <span className="terminal-label">{"// message"}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="The message that gets sent to the guest…" className="mt-2 w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber" />
        </label>

        {/* Attachments */}
        <div>
          <span className="terminal-label">{"// attachments (optional)"}</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={a.url} className="relative">
                <img src={a.url} alt={a.label} className="h-16 w-16 object-cover rounded-md border border-line-bright" />
                <button type="button" onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center" title="Remove">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-16 w-16 rounded-md border border-dashed border-line-bright flex items-center justify-center text-mocha hover:text-amber hover:border-amber disabled:opacity-50">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {error && <p className="font-mono text-xs text-red-400">// {error}</p>}

        <button type="button" onClick={save} disabled={saving || uploading} className="inline-flex items-center gap-2 bg-amber text-bg rounded-md px-4 py-2 font-mono text-xs uppercase tracking-widest disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingId ? "Update reply" : "Add reply"}
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {replies.length === 0 && <p className="font-mono text-xs text-mocha">// no saved replies yet</p>}
        {replies.map((r) => (
          <div key={r.id} className={`p-4 border rounded-lg bg-bg flex items-start justify-between gap-4 ${editingId === r.id ? "border-amber" : "border-line"}`}>
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
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => startEdit(r)} title="Edit" className="text-cream-dim hover:text-amber p-2"><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(r.id)} title="Delete" className="text-red-400 hover:text-red-300 p-2"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
