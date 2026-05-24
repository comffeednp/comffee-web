import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { markHandledAction, deleteSubmissionAction } from "../_actions/contact";
import { Check, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { ContactSubmission } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ContactSubmissionsPage() {
  await requireFullAdmin();
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("contact_form_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const submissions = (data ?? []) as ContactSubmission[];

  return (
    <section className="container-edge py-12 max-w-4xl">
      <p className="terminal-label">/inbox</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        Contact inbox
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Messages from the public contact form. Mark handled when you&apos;ve replied.
      </p>

      <ul className="mt-10 space-y-3">
        {submissions.map((s) => (
          <li
            key={s.id}
            className={`p-5 rounded-xl border ${
              s.handled
                ? "border-line bg-bg-card opacity-60"
                : "border-amber/30 bg-bg-card glow-amber"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-display text-lg font-semibold text-cream">{s.name}</span>
                  {s.handled ? (
                    <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                      handled
                    </span>
                  ) : (
                    <span className="status-chip status-chip-amber">new</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-cream-dim">
                  {s.email && <span>{s.email}</span>}
                  {s.phone && <span>· {s.phone}</span>}
                  <span>· {formatDateTime(s.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!s.handled && (
                  <form action={markHandledAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      title="Mark this message as handled"
                      className="flex items-center gap-1.5 border border-phosphor/50 rounded-md px-3 py-1.5 text-[0.7rem] font-mono uppercase tracking-widest text-phosphor hover:bg-phosphor/10"
                    >
                      <Check className="h-3 w-3" />
                      Handled
                    </button>
                  </form>
                )}
                <form action={deleteSubmissionAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="text-red-400 hover:text-red-300 p-2" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            </div>
            <p className="mt-4 text-cream whitespace-pre-line text-sm leading-relaxed">{s.message}</p>
          </li>
        ))}
        {submissions.length === 0 && (
          <li className="font-mono text-sm text-mocha">// inbox empty</li>
        )}
      </ul>
    </section>
  );
}
