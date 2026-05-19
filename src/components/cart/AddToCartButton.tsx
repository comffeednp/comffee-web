"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { useCart, type CartItem } from "./CartProvider";

interface Props {
  item: Omit<CartItem, "qty">;
  compact?: boolean;
}

export default function AddToCartButton({ item, compact }: Props) {
  const { addItem } = useCart();
  const [pinged, setPinged] = useState(false);

  const handle = () => {
    addItem(item);
    setPinged(true);
    setTimeout(() => setPinged(false), 800);
  };

  return (
    <button
      type="button"
      onClick={handle}
      className={`relative flex items-center justify-center gap-1.5 border border-line-bright rounded-md transition group ${
        compact ? "h-8 w-8" : "px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-widest"
      } text-cream-dim hover:text-amber hover:border-amber/60`}
      aria-label="Add to cart"
    >
      <AnimatePresence mode="wait">
        {pinged ? (
          <motion.span
            key="check"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="text-phosphor"
          >
            <Check className={compact ? "h-4 w-4" : "h-3 w-3"} />
          </motion.span>
        ) : (
          <motion.span
            key="plus"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
          >
            <Plus className={compact ? "h-4 w-4" : "h-3 w-3"} />
          </motion.span>
        )}
      </AnimatePresence>
      {!compact && <span>{pinged ? "Added" : "Add"}</span>}
      {/* ping ring */}
      <AnimatePresence>
        {pinged && (
          <motion.span
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 rounded-md border border-phosphor pointer-events-none"
          />
        )}
      </AnimatePresence>
    </button>
  );
}
