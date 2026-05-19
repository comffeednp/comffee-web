"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin error]", error);
  }, [error]);

  return (
    <div className="container-edge py-20">
      <div className="max-w-md mx-auto p-8 border border-red-700/50 bg-red-950/10 rounded-2xl">
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-red-400">
          // admin.error
        </p>
        <h2 className="mt-3 font-display text-2xl font-bold text-cream">
          Something failed.
        </h2>
        <p className="mt-2 text-sm text-cream-dim">
          {error.message || "An unexpected error occurred while loading this admin page."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[0.65rem] text-mocha">
            // ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={reset} className="key-cap !py-2 !px-4">
            <RotateCw className="h-3.5 w-3.5" />
            Retry
          </button>
          <Link href="/admin/dashboard" className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber self-center">
            ← back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
