"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Power, Terminal, X } from "lucide-react";
import type { NavItem } from "@/lib/nav";

interface Props {
  links: NavItem[];
  memberHref: string;
  memberLabel: string;
}

const itemClass = (active: boolean) =>
  `block px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-[0.18em] transition ${
    active
      ? "bg-bg-card text-amber border border-amber/40"
      : "text-cream-dim hover:text-amber hover:bg-bg-card"
  }`;

export default function MobileNav({ links, memberHref, memberLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = original; };
    }
  }, [open]);

  const overlay = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-bg/85 backdrop-blur-sm z-[60]"
            aria-label="Close menu"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 bottom-0 w-[85vw] max-w-sm z-[70] bg-bg-soft border-l border-line-bright shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream">
                <Terminal className="h-3.5 w-3.5 text-amber" />
                comffee<span className="text-mocha">_</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 text-cream-dim hover:text-amber"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 p-5 overflow-y-auto">
              <ul className="space-y-1">
                {links.map((link) =>
                  link.children ? (
                    <li key={link.label} className="pt-1">
                      <p className="px-4 pt-2 pb-1 font-mono text-[0.62rem] uppercase tracking-[0.22em] text-mocha">
                        {link.label}
                      </p>
                      <ul className="space-y-1">
                        {link.children.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              title={`Go to ${child.label}`}
                              className={itemClass(pathname === child.href)}
                            >
                              → {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ) : (
                    <li key={link.href}>
                      <Link
                        href={link.href!}
                        title={`Go to ${link.label}`}
                        className={
                          link.highlight
                            ? "nav-shine block px-4 py-3 font-mono text-sm uppercase tracking-[0.18em]"
                            : itemClass(pathname === link.href)
                        }
                      >
                        → {link.label}
                        {link.badge && (
                          <span className="ml-2 rounded bg-bg/90 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-normal text-amber">
                            {link.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                )}
              </ul>

              <div className="mt-6 pt-6 border-t border-line">
                <Link
                  href={memberHref}
                  className="block px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-[0.18em] text-cream-dim hover:text-amber hover:bg-bg-card transition"
                >
                  → {memberLabel}
                </Link>
              </div>
            </nav>

            <div className="border-t border-line p-5">
              <Link href="/playcation" className="key-cap key-cap-primary w-full justify-center">
                <Power className="h-4 w-4" />
                Book Playcation
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden flex h-10 w-10 items-center justify-center border border-line-bright bg-bg-card rounded-md text-cream-dim hover:text-amber hover:border-amber/60 transition"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="h-4 w-4" />
      </button>

      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
