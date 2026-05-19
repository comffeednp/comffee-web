import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ArrowRight, Plus } from "lucide-react";
import type { Branch } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AdminBranchesPage() {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("branches")
    .select("*")
    .order("sort_order", { ascending: true });
  const branches = (data ?? []) as Branch[];

  return (
    <section className="container-edge py-12">
      <div className="flex items-end justify-between gap-6 mb-10">
        <div>
          <p className="terminal-label">/branches</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
            Branches
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Add or edit cafes and Playcation stays. Toggle publish to make them visible on the public site.
          </p>
        </div>
        <Link href="/admin/branches/new" className="key-cap key-cap-primary">
          <Plus className="h-4 w-4" />
          New branch
        </Link>
      </div>

      <div className="border border-line-bright rounded-xl overflow-hidden bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-left">
              <th className="px-5 py-3 font-mono text-[0.65rem] uppercase tracking-widest text-mocha">Name</th>
              <th className="px-5 py-3 font-mono text-[0.65rem] uppercase tracking-widest text-mocha">Type</th>
              <th className="px-5 py-3 font-mono text-[0.65rem] uppercase tracking-widest text-mocha">City</th>
              <th className="px-5 py-3 font-mono text-[0.65rem] uppercase tracking-widest text-mocha">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-t border-line hover:bg-bg-elev/40">
                <td className="px-5 py-4">
                  <div className="text-cream font-medium">{b.name}</div>
                  <div className="font-mono text-[0.65rem] text-mocha mt-0.5">/{b.slug}</div>
                </td>
                <td className="px-5 py-4">
                  <span className={`status-chip ${b.type === "playcation" ? "status-chip-amber" : ""}`}>
                    {b.type}
                  </span>
                </td>
                <td className="px-5 py-4 text-cream-dim">{b.city ?? "—"}</td>
                <td className="px-5 py-4">
                  {b.is_published ? (
                    <span className="status-chip">live</span>
                  ) : (
                    <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">draft</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/branches/${b.id}`}
                    className="font-mono text-xs uppercase tracking-widest text-amber hover:underline inline-flex items-center gap-1"
                  >
                    Edit <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-cream-dim font-mono">
                  // no branches yet — click &ldquo;new branch&rdquo; to get started
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
