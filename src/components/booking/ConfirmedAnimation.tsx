"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

/**
 * Minimal success reveal animation for confirmation pages.
 * Subtle rings + scale-in — black check on white, consistent with the
 * sleek light theme.
 */
export default function ConfirmedAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", duration: 1, bounce: 0.4 }}
      className="relative mx-auto w-32 h-32 md:w-40 md:h-40"
    >
      {/* Soft pulse rings (subtle gray) */}
      <motion.span
        className="absolute inset-0 rounded-full border border-line-bright"
        animate={{ scale: [1, 1.6, 1.6], opacity: [0.5, 0, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        className="absolute inset-0 rounded-full border border-line"
        animate={{ scale: [1, 2, 2], opacity: [0.3, 0, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.3, ease: "easeOut" }}
      />

      {/* Check badge */}
      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#0a0a0a] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)]">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.6, delay: 0.3, bounce: 0.5 }}
        >
          <Check className="h-14 w-14 md:h-16 md:w-16 text-white" strokeWidth={3} />
        </motion.div>
      </div>
    </motion.div>
  );
}
