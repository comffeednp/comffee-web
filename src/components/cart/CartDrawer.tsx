"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Minus, Plus, Power, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "./CartProvider";
import { formatPHP } from "@/lib/utils";

export default function CartDrawer() {
  const { items, totalPhp, removeItem, setQty, isOpen, close, hydrated } = useCart();
  if (!hydrated) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-[60]"
            onClick={close}
            aria-label="Close cart"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[26rem] z-[70] bg-bg-card border-l border-line-bright flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-line bg-bg-soft flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-amber" />
                <span className="font-mono text-xs uppercase tracking-widest text-cream">
                  cart // {items.length}
                </span>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-1.5 text-cream-dim hover:text-amber"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-10 text-center">
                  <ShoppingBag className="mx-auto h-10 w-10 text-mocha" />
                  <p className="mt-4 font-mono text-xs uppercase tracking-widest text-mocha">
                    // empty cart
                  </p>
                  <p className="mt-2 text-cream-dim text-sm">
                    Add something tasty from the menu.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {items.map((item) => (
                    <li key={item.menuItemId} className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-cream font-medium">{item.name}</p>
                          <p className="font-mono text-xs text-amber mt-0.5">
                            {formatPHP(item.price)}
                          </p>
                        </div>
                        <button
                          onClick={() => removeItem(item.menuItemId)}
                          className="text-red-400 hover:text-red-300 p-1.5"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1 border border-line-bright rounded-md">
                          <button
                            onClick={() => setQty(item.menuItemId, item.qty - 1)}
                            className="px-2.5 py-1.5 text-cream-dim hover:text-amber"
                            aria-label="Decrease"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-sm text-cream w-6 text-center">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => setQty(item.menuItemId, item.qty + 1)}
                            className="px-2.5 py-1.5 text-cream-dim hover:text-amber"
                            aria-label="Increase"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="font-mono text-amber font-semibold text-sm">
                          {formatPHP(item.price * item.qty)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-line bg-bg-soft p-6 space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                    // subtotal
                  </span>
                  <span className="text-2xl font-display font-bold text-amber text-glow-amber">
                    {formatPHP(totalPhp)}
                  </span>
                </div>
                <Link
                  href="/order/checkout"
                  onClick={close}
                  className="key-cap key-cap-primary w-full justify-center"
                >
                  <Power className="h-4 w-4" />
                  Checkout
                </Link>
                <p className="text-center font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                  // pickup at any branch · pay via gcash, maya, card
                </p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
