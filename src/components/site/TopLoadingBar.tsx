"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Top progress bar that gives INSTANT feedback the moment a navigation begins.
 *
 * The old version triggered on `usePathname()` change — but in the App Router the
 * pathname only changes AFTER the server round-trip completes, so on the 19
 * force-dynamic pages the bar appeared only once the new page had already loaded
 * (i.e. ~1s of dead click, then the bar flashed pointlessly). This version starts
 * the bar on the link click itself and finishes it when the route commits, so the
 * user sees motion immediately and never thinks the page is frozen.
 */
export default function TopLoadingBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0); // 0 = hidden
  const [visible, setVisible] = useState(false);
  const trickleRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const activeRef = useRef(false);

  const clearAll = () => {
    if (trickleRef.current !== null) {
      window.clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  };

  const start = () => {
    clearAll();
    activeRef.current = true;
    setVisible(true);
    setProgress(8);
    // Ease toward ~90% while we wait for the route to commit — never reaches 100%
    // until the navigation actually finishes.
    trickleRef.current = window.setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(0.4, (90 - p) * 0.07) : p));
    }, 120);
    // Safety: if the click never results in a committed navigation, retract.
    timersRef.current.push(window.setTimeout(() => finish(), 6000));
  };

  const finish = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (trickleRef.current !== null) {
      window.clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    setProgress(100);
    timersRef.current.push(window.setTimeout(() => setVisible(false), 180));
    timersRef.current.push(window.setTimeout(() => setProgress(0), 380));
  };

  // Start the bar the instant an internal link is clicked — BEFORE the server
  // responds. Capture phase so we see the click even if a handler stops propagation.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Same-origin, real path change only (skip externals, #anchors, query-only).
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Route committed (pathname changed) → finish the bar. Skip the initial mount.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    finish();
  }, [pathname]);

  // Clean up timers on unmount.
  useEffect(() => clearAll, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 z-[999] h-[2px]"
      style={{
        width: `${progress}%`,
        opacity: visible ? 1 : 0,
        background: "var(--color-amber)",
        boxShadow: "0 0 8px var(--color-amber), 0 0 4px var(--color-amber)",
        transition: "width 200ms ease-out, opacity 250ms ease-out",
        willChange: "width, opacity",
      }}
    />
  );
}
