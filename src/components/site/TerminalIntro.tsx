"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  lines: string[];
  className?: string;
}

/**
 * Boot-sequence style typing animation. Renders each line one after the
 * other with a blinking cursor on the last line. Plays once on mount.
 */
export default function TerminalIntro({ lines, className }: Props) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= lines.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), 320);
    return () => clearTimeout(t);
  }, [shown, lines.length]);

  return (
    <div className={`font-mono text-[0.78rem] md:text-sm leading-relaxed ${className ?? ""}`}>
      {lines.slice(0, shown).map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="flex"
        >
          <span className="text-mocha mr-3 select-none">›</span>
          <span className="text-cream-dim">{line}</span>
          {i === shown - 1 && i < lines.length - 1 && (
            <span className="ml-1 inline-block w-2 h-3 bg-cream animate-pulse" />
          )}
        </motion.div>
      ))}
      {shown >= lines.length && (
        <div className="flex mt-1">
          <span className="text-mocha mr-3 select-none">›</span>
          <span className="text-cream cursor-blink">ready</span>
        </div>
      )}
    </div>
  );
}
