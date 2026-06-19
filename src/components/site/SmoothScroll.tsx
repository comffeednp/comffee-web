"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * Mounts Lenis once for buttery smooth-scroll site-wide. Respects
 * prefers-reduced-motion (Lenis will internally skip animation).
 *
 * Also resets scroll to the TOP on every route change. Lenis manages scroll
 * itself, so Next's App Router does not auto-scroll-to-top on client navigation —
 * without this, opening a branch from a scrolled-down list keeps that scroll
 * position and hides the top of the page (header + promo banner).
 */
export default function SmoothScroll() {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Jump to the top whenever the path changes (and on first mount), so every page
  // opens at its header/banner instead of inheriting the previous scroll position.
  useEffect(() => {
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
