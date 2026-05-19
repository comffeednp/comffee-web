"use client";

import { ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "./CartProvider";

export default function CartButton() {
  const { totalQty, toggle, hydrated } = useCart();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open cart"
      className="relative flex h-10 w-10 items-center justify-center border border-line-bright bg-bg-card rounded-md text-cream-dim hover:text-amber hover:border-amber/60 transition"
    >
      <ShoppingBag className="h-4 w-4" />
      <AnimatePresence>
        {hydrated && totalQty > 0 && (
          <motion.span
            key={totalQty}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.5 }}
            className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-amber text-bg flex items-center justify-center font-mono text-[0.65rem] font-bold shadow-[0_0_12px_rgba(255,181,71,0.5)]"
          >
            {totalQty}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
