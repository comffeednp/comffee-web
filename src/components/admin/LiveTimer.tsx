"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  /** ISO timestamp when the session started (actual_start) */
  startedAt: string;
  /** Total duration in minutes (requested duration + extensions) */
  totalMinutes: number;
}

/**
 * Live ticking countdown for an active internet cafe session.
 * Updates every second client-side. Turns red when overtime.
 */
export default function LiveTimer({ startedAt, totalMinutes }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startedAt).getTime();
  const elapsedMs = now - start;
  const totalMs = totalMinutes * 60 * 1000;
  const remainingMs = totalMs - elapsedMs;
  const overtime = remainingMs < 0;
  const absMs = Math.abs(remainingMs);

  const hours = Math.floor(absMs / (1000 * 60 * 60));
  const minutes = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absMs % (1000 * 60)) / 1000);

  const pct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));

  return (
    <div className="monitor-frame">
      <div className="monitor-screen p-8 text-center">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
          {overtime ? "// overtime" : "// remaining"}
        </p>
        <motion.div
          key={`${overtime}`}
          initial={{ scale: 0.98 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
          className={`mt-4 font-display font-bold tracking-tight tabular-nums text-7xl md:text-8xl ${
            overtime ? "text-red-400" : "text-amber text-glow-amber"
          }`}
        >
          {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
          {String(seconds).padStart(2, "0")}
        </motion.div>

        {/* Progress bar */}
        <div className="mt-8 mx-auto max-w-md h-2 bg-line-bright rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${overtime ? "bg-red-500" : "bg-amber"}`}
            initial={{ width: "0%" }}
            animate={{ width: `${overtime ? 100 : pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        <p className="mt-6 font-mono text-xs text-cream-dim">
          // session length: {totalMinutes} min · started{" "}
          {new Date(startedAt).toLocaleTimeString("en-PH")}
        </p>
      </div>
    </div>
  );
}
