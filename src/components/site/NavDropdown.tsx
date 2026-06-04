"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { NavChild } from "@/lib/nav";

interface Props {
  label: string;
  items: NavChild[];
}

// Desktop-only dropdown used in the top bar (the mobile drawer renders the same items inline).
// Opens on hover, click, or keyboard focus; closes on Escape, outside click, route change, or
// pointer-leave (with a short grace period so a diagonal cursor path to the menu doesn't snap it
// shut).
export default function NavDropdown({ label, items }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger reads as "active" whenever the current route is one of its items.
  const active = items.some(
    (it) => pathname === it.href || pathname.startsWith(it.href + "/")
  );

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => cancelClose, []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Browse ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] px-3 py-2 rounded transition-colors focus-visible:outline-none ${
          active || open ? "text-cream" : "text-cream-dim hover:text-cream"
        }`}
      >
        {label}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full mt-1 min-w-[12rem] rounded-md border border-line-bright bg-bg-soft shadow-2xl py-1.5 z-50"
        >
          {items.map((it) => {
            const itemActive = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                title={`Go to ${it.label}`}
                className={`block px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.16em] whitespace-nowrap transition-colors ${
                  itemActive
                    ? "text-amber bg-bg-card"
                    : "text-cream-dim hover:text-amber hover:bg-bg-card"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
