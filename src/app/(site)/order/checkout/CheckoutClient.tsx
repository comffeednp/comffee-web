"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Coffee,
  Loader2,
  Power,
  ShoppingBag,
} from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { formatPHP } from "@/lib/utils";

interface PickupBranch {
  id: string;
  name: string;
  city: string | null;
}

export default function CheckoutClient({
  pickupBranches,
}: {
  pickupBranches: PickupBranch[];
}) {
  const router = useRouter();
  const { items, totalPhp, clear, hydrated } = useCart();
  const [branchId, setBranchId] = useState(pickupBranches[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Default scheduled time = 30 min from now (local datetime input)
  useEffect(() => {
    if (!scheduledFor) {
      const d = new Date(Date.now() + 30 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setScheduledFor(local);
    }
  }, [scheduledFor]);

  if (!hydrated) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-20 border border-line-bright bg-bg-card rounded-2xl px-8">
        <ShoppingBag className="mx-auto h-10 w-10 text-mocha" />
        <p className="mt-6 font-mono text-sm text-mocha uppercase tracking-widest">
          // your cart is empty
        </p>
        <Link href="/menu" title="Browse the menu" className="key-cap mt-8 inline-flex">
          <Coffee className="h-4 w-4" />
          Browse menu
        </Link>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!branchId) {
      setErrorMsg("pick a branch for pickup");
      return;
    }
    if (!name.trim()) {
      setErrorMsg("name is required");
      return;
    }
    setErrorMsg(null);
    setLoading(true);

    startTransition(async () => {
      try {
        const res = await fetch("/api/orders/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId,
            customerName: name,
            customerPhone: phone,
            customerEmail: email,
            scheduledFor: scheduledFor
              ? new Date(scheduledFor).toISOString()
              : "",
            notes,
            items: items.map((i) => ({
              menuItemId: i.menuItemId,
              qty: i.qty,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLoading(false);
          setErrorMsg(data.error ?? "checkout failed");
          return;
        }
        if (data.checkoutUrl) {
          clear();
          window.location.href = data.checkoutUrl;
          return;
        }
        if (data.simulated && data.orderId) {
          clear();
          router.push(`/order/confirmed/${data.orderId}`);
          return;
        }
        setLoading(false);
        setErrorMsg("unexpected response");
      } catch (e) {
        setLoading(false);
        setErrorMsg(e instanceof Error ? e.message : "network error");
      }
    });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
      {/* LEFT — form */}
      <div className="border border-line-bright bg-bg-card rounded-2xl p-6 md:p-10">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center"
            >
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full border-4 border-line-bright border-t-amber animate-spin" />
                  <Coffee className="absolute inset-0 m-auto h-7 w-7 text-amber" />
                </div>
              </div>
              <p className="mt-8 font-mono text-sm text-phosphor">
                // PLACING ORDER...
              </p>
              <p className="mt-2 font-mono text-xs text-cream-dim">
                snapshotting prices · creating payment link · routing to checkout
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* PICKUP */}
              <div>
                <p className="terminal-label">step.01 // pickup</p>
                <h2 className="mt-2 font-display text-2xl font-bold text-cream">
                  Where do we hand it over?
                </h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {pickupBranches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBranchId(b.id)}
                      title={`Pick up at ${b.name}`}
                      className={`text-left p-4 rounded-lg border transition ${
                        branchId === b.id
                          ? "border-amber/60 bg-amber/5 glow-amber"
                          : "border-line-bright bg-bg hover:border-amber/40"
                      }`}
                    >
                      <p className="font-display font-semibold text-cream">{b.name}</p>
                      <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-widest text-mocha">
                        {b.city ?? "—"}
                      </p>
                    </button>
                  ))}
                  {pickupBranches.length === 0 && (
                    <p className="font-mono text-xs text-mocha col-span-full">
                      // no cafe branches available for pickup
                    </p>
                  )}
                </div>
              </div>

              {/* TIME */}
              <Field label="ready by">
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="checkout-input"
                />
              </Field>

              {/* CUSTOMER */}
              <div>
                <p className="terminal-label">step.02 // your_info</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <Field label="full name *">
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="checkout-input"
                      placeholder="Player one"
                    />
                  </Field>
                  <Field label="phone">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="checkout-input"
                      placeholder="+63 9XX XXX XXXX"
                    />
                  </Field>
                </div>
                <div className="mt-5">
                  <Field label="email (for receipt)">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="checkout-input"
                      placeholder="you@example.com"
                    />
                  </Field>
                </div>
                <div className="mt-5">
                  <Field label="notes (allergies, special requests)">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="checkout-input resize-y"
                      placeholder="No sugar in the latte, etc."
                    />
                  </Field>
                </div>
              </div>

              {errorMsg && (
                <div className="p-4 border border-red-700 bg-red-950/20 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5" />
                  <p className="font-mono text-xs text-red-400">// {errorMsg}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                title="Place order and proceed to payment"
                className="key-cap key-cap-primary w-full justify-center"
              >
                <Power className="h-4 w-4" />
                Power on & pay {formatPHP(totalPhp)}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT — order summary */}
      <aside className="lg:sticky lg:top-24 self-start">
        <div className="border border-line-bright bg-bg-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line bg-bg-soft">
            <p className="terminal-label">// your_order</p>
          </div>
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li
                key={item.menuItemId}
                className="px-6 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-cream text-sm font-medium">{item.name}</p>
                  <p className="font-mono text-[0.7rem] text-mocha mt-0.5">
                    × {item.qty} @ {formatPHP(item.price)}
                  </p>
                </div>
                <span className="font-mono text-amber text-sm font-semibold whitespace-nowrap">
                  {formatPHP(item.price * item.qty)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-6 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                // total
              </span>
              <span className="text-3xl font-display font-bold text-amber text-glow-amber">
                {formatPHP(totalPhp)}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <style>{`
        .checkout-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.625rem;
          padding: 0.75rem 1rem;
          color: var(--color-cream);
          font-family: var(--font-mono);
          font-size: 0.95rem;
          color-scheme: dark;
        }
        .checkout-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4), 0 0 16px rgba(255,181,71,0.15);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
        // {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
