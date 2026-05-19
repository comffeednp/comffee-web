"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <section className="container-edge py-32 md:py-48 text-center">
      <p className="terminal-label">error.unhandled</p>
      <h1 className="mt-4 font-display text-5xl md:text-7xl font-bold text-cream tracking-tight">
        Crashed.
      </h1>
      <p className="mt-4 max-w-lg mx-auto text-cream-dim">
        Something blew up rendering this page. We&apos;ve logged the error.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[0.7rem] text-mocha">
          // ref: {error.digest}
        </p>
      )}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button type="button" onClick={reset} className="key-cap key-cap-primary">
          <RotateCw className="h-4 w-4" />
          Try again
        </button>
        <Link href="/" className="key-cap">
          Return home
        </Link>
      </div>
    </section>
  );
}
