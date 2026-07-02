"use client";

import { motion, type Variants } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useInView } from "react-intersection-observer";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}

const variants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

export default function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  once = true,
}: RevealProps) {
  // fallbackInView: if IntersectionObserver is unavailable, render visible rather
  // than hidden — content must never depend on the observer existing.
  const { ref: inViewRef, inView } = useInView({
    triggerOnce: once,
    threshold: 0.15,
    fallbackInView: true,
  });
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [healed, setHealed] = useState(false);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      nodeRef.current = el;
      inViewRef(el);
    },
    [inViewRef],
  );

  // Self-heal: an IntersectionObserver callback can be missed when the browser
  // restores scroll on RELOAD — the section paints above the viewport, the observer
  // records "not in view", then Lenis jumps to the top. With triggerOnce that content
  // would stay invisible forever (the "page is incomplete on reload, fine in a new
  // tab" bug). Re-measure real geometry after mount + after the scroll settles, and
  // reveal anything actually on screen. Off-screen content is untouched, so it still
  // animates in on scroll as intended.
  useEffect(() => {
    if (inView || healed) return;
    const reveal = () => {
      const el = nodeRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top < vh && r.bottom > 0) setHealed(true);
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(reveal));
    // Lenis scroll-to-top on mount fires async; re-check once it has settled.
    const t1 = window.setTimeout(reveal, 300);
    const t2 = window.setTimeout(reveal, 800);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [inView, healed]);

  const show = inView || healed;

  return (
    <motion.div
      ref={setRefs}
      initial="hidden"
      animate={show ? "show" : "hidden"}
      variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0 } }}
      transition={{
        duration: 0.7,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// also export the variants for callers that need their own motion components
export { variants as revealVariants };
