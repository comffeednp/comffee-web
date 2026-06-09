"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

// Inline panel on /admin/branches/<id> — shown when a cafe owner has submitted page changes from
// the POS Reservation tab and they're awaiting review. One-click Approve (applies the changes to
// the live tables) or Reject + note (owner sees the note in their POS). Empty state = renders
// nothing, so the admin page is unchanged visually when there's no work to do.
// [[comffee-saas-vision]] Stage 4a.

interface Submission {
  id: string;
  submitted_at: string;
  submitted_by: string | null;
  payload: Record<string, unknown>;
}

interface Props {
  submissions: Submission[];
}

export default function PendingBranchEditPanel({ submissions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  async function approve(id: string) {
    setActionMsg((m) => ({ ...m, [id]: "Approving…" }));
    try {
      const res = await fetch(`/api/admin/branch-edits/${id}/approve`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (data.ok) {
        setActionMsg((m) => ({ ...m, [id]: "✓ Approved — applied to the live page." }));
        startTransition(() => router.refresh());
      } else {
        setActionMsg((m) => ({ ...m, [id]: `✗ Approve failed: ${data.error || res.status}` }));
      }
    } catch (e) {
      setActionMsg((m) => ({ ...m, [id]: `✗ Approve failed: ${e instanceof Error ? e.message : "network error"}` }));
    }
  }

  async function reject(id: string) {
    const note = (rejectNote[id] || "").trim();
    if (!note) {
      setActionMsg((m) => ({ ...m, [id]: "✗ Reason is required — the owner sees this in their POS." }));
      return;
    }
    setActionMsg((m) => ({ ...m, [id]: "Rejecting…" }));
    try {
      const res = await fetch(`/api/admin/branch-edits/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (data.ok) {
        setActionMsg((m) => ({ ...m, [id]: "✓ Rejected — owner will see your note in their POS." }));
        startTransition(() => router.refresh());
      } else {
        setActionMsg((m) => ({ ...m, [id]: `✗ Reject failed: ${data.error || res.status}` }));
      }
    } catch (e) {
      setActionMsg((m) => ({ ...m, [id]: `✗ Reject failed: ${e instanceof Error ? e.message : "network error"}` }));
    }
  }

  if (!submissions || submissions.length === 0) return null;

  return (
    <div className="space-y-4 mb-6">
      {submissions.map((sub) => {
        const summary = describePayload(sub.payload);
        const msg = actionMsg[sub.id];
        return (
          <div
            key={sub.id}
            className="rounded-xl border-2 border-amber/60 bg-amber/10 p-5"
            data-pending-submission={sub.id}
          >
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle className="h-5 w-5 text-amber flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg text-cream font-bold">
                  Pending submission from the POS
                </h3>
                <p className="text-xs text-mocha font-mono mt-1">
                  Submitted {new Date(sub.submitted_at).toLocaleString("en-PH")}
                  {sub.submitted_by ? (
                    <>
                      {" · by "}
                      <code className="bg-bg px-1.5 py-0.5 rounded">{sub.submitted_by}</code>
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            {summary.length > 0 && (
              <ul className="text-sm text-cream-dim mb-4 pl-6 list-disc space-y-1">
                {summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}

            <details className="mb-4">
              <summary
                className="text-xs font-mono uppercase tracking-widest text-mocha cursor-pointer hover:text-cream"
                title="Show the raw submitted payload"
              >
                View full payload
              </summary>
              <pre className="mt-2 p-3 bg-bg rounded text-xs overflow-x-auto text-cream-dim font-mono leading-relaxed">
                {JSON.stringify(sub.payload, null, 2)}
              </pre>
            </details>

            <div className="flex flex-wrap gap-3 items-start">
              <button
                type="button"
                onClick={() => approve(sub.id)}
                disabled={isPending}
                title="Apply these changes to the live page"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-md text-sm font-semibold"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
              <div className="flex-1 min-w-[280px] flex gap-2">
                <input
                  type="text"
                  placeholder="Reason for rejecting (owner sees this)"
                  value={rejectNote[sub.id] || ""}
                  onChange={(e) =>
                    setRejectNote((r) => ({ ...r, [sub.id]: e.target.value }))
                  }
                  className="flex-1 px-3 py-2 bg-bg border border-line rounded-md text-sm text-cream"
                />
                <button
                  type="button"
                  onClick={() => reject(sub.id)}
                  disabled={isPending}
                  title="Reject — owner sees your note in their POS"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-md text-sm font-semibold"
                >
                  <XCircle className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
            {msg && (
              <div className="mt-3 text-sm text-cream" data-action-msg>
                {msg}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Friendly summary bullets of what's in the payload — enough for the admin to scan in a glance
// without expanding the raw JSON.
function describePayload(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof p.name === "string" && p.name) out.push(`Name: ${p.name}`);
  if (typeof p.tagline === "string") out.push(`Tagline: ${p.tagline || "(blank)"}`);
  if (typeof p.address === "string") out.push(`Address: ${p.address}`);
  if (typeof p.hours_text === "string") out.push(`Hours: ${p.hours_text}`);
  if (typeof p.phone === "string") out.push(`Phone: ${p.phone}`);
  if (typeof p.email === "string") out.push(`Email: ${p.email}`);
  if (p.lat != null && p.lng != null) out.push(`Location pin: ${p.lat}, ${p.lng}`);
  if (Array.isArray(p.photos)) out.push(`Photos: ${p.photos.length}`);
  if (Array.isArray(p.amenities)) out.push(`Amenities: ${p.amenities.length}`);
  if (Array.isArray(p.rates)) out.push(`Rates: ${p.rates.length}`);
  if (p.rate_config && typeof p.rate_config === "object") out.push("Rate config updated");
  if (typeof p.is_published === "boolean")
    out.push(`Published: ${p.is_published ? "yes" : "no"}`);
  return out;
}
