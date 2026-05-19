import { requireAdmin } from "@/lib/auth/require-admin";
import { createBranchAction } from "../../_actions/branches";
import BranchCoreFields from "@/components/admin/BranchCoreFields";
import { Save } from "lucide-react";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewBranchPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { error } = await searchParams;

  return (
    <section className="container-edge py-12 max-w-4xl">
      <p className="terminal-label">/branches/new</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        New branch
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Fill the basics now — you can add amenities, photos, and rates after saving.
      </p>

      {error && (
        <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>
      )}

      <form action={createBranchAction} className="mt-10 space-y-8">
        <BranchCoreFields />

        <div className="flex items-center gap-3">
          <button type="submit" className="key-cap key-cap-primary">
            <Save className="h-4 w-4" />
            Create branch
          </button>
          <Link href="/admin/branches" className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
