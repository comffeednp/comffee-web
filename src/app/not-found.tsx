import Link from "next/link";
import { ArrowRight, Home } from "lucide-react";

export default function NotFound() {
  return (
    <section className="container-edge py-32 md:py-48 text-center">
      <p className="terminal-label">error.404</p>
      <h1 className="mt-4 font-display text-7xl md:text-[10rem] leading-none font-bold tracking-tight text-cream">
        404
      </h1>
      <p className="mt-6 text-cream-dim text-lg max-w-lg mx-auto">
        That page is offline. Or never existed in the first place.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link href="/" className="key-cap key-cap-primary" title="Go to the home page">
          <Home className="h-4 w-4" />
          Return to base
        </Link>
        <Link href="/branches" className="key-cap" title="View all Comffee branches">
          See branches
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-16 max-w-md mx-auto p-5 border border-line rounded-xl bg-bg-card">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
          // popular destinations
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-left">
          {[
            { href: "/playcation", label: "Playcation stays" },
            { href: "/menu", label: "Menu" },
            { href: "/branches", label: "All branches" },
            { href: "/contact", label: "Contact" },
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                title={`Go to ${l.label}`}
                className="block font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber py-1"
              >
                → {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
