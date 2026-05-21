"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Loader2,
  Wallet,
} from "lucide-react";
import { formatPHP } from "@/lib/utils";

interface Branch {
  id: string;
  name: string;
  city: string | null;
}

interface Props {
  branches: Branch[];
}

const PRESET_AMOUNTS = [50, 100, 200, 300, 500, 1000];

type Step = "form" | "loading" | "error";

export default function TopupClient({ branches }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [memberNumber, setMemberNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [amount, setAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const effectiveAmount =
    customAmount.trim() !== ""
      ? Math.floor(parseFloat(customAmount) || 0)
      : amount;

  const canSubmit =
    !!branchId &&
    memberNumber.trim().length > 0 &&
    customerName.trim().length > 0 &&
    effectiveAmount >= 20 &&
    effectiveAmount <= 10000;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setErrorMsg(null);
    setStep("loading");

    startTransition(async () => {
      try {
        const res = await fetch("/api/topup/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId,
            memberNumber: memberNumber.trim(),
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            customerEmail: customerEmail.trim(),
            amountPhp: effectiveAmount,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStep("error");
          setErrorMsg(data.error ?? "topup_failed");
          return;
        }
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        if (data.simulated && data.topupId) {
          // Dev mode — jump straight to confirmation
          window.location.href = `/topup/confirmed/${data.topupId}`;
          return;
        }
        setStep("error");
        setErrorMsg("unexpected_response");
      } catch (e) {
        setStep("error");
        setErrorMsg(e instanceof Error ? e.message : "network_error");
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="border border-line-bright bg-bg-card rounded-2xl p-6 md:p-10">
        <AnimatePresence mode="wait">
          {step === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Branch */}
              {branches.length > 1 && (
                <div>
                  <p className="terminal-label">// branch</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {branches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBranchId(b.id)}
                        title={`Select ${b.name} as branch`}
                        className={`p-4 rounded-lg border text-left transition ${
                          branchId === b.id
                            ? "border-amber bg-amber/10 glow-amber"
                            : "border-line-bright bg-bg hover:border-amber/60"
                        }`}
                      >
                        <p className="font-display font-semibold text-cream">
                          {b.name}
                        </p>
                        <p className="mt-1 font-mono text-[0.7rem] uppercase text-mocha">
                          {b.city ?? "—"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Member number */}
              <Field label="member number *">
                <input
                  type="text"
                  required
                  value={memberNumber}
                  onChange={(e) => setMemberNumber(e.target.value)}
                  className="topup-input"
                  placeholder="Your PanCafe member number"
                  autoComplete="off"
                />
              </Field>

              {/* Name + contact */}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="your name *">
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="topup-input"
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                  />
                </Field>
                <Field label="phone">
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="topup-input"
                    placeholder="+63 9XX XXX XXXX"
                    autoComplete="tel"
                  />
                </Field>
              </div>
              <Field label="email (optional, for receipt)">
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="topup-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>

              {/* Amount */}
              <div>
                <p className="terminal-label">// amount (₱)</p>
                <div className="mt-3 grid gap-2 grid-cols-3 sm:grid-cols-6">
                  {PRESET_AMOUNTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setAmount(preset);
                        setCustomAmount("");
                      }}
                      title={`Set amount to ₱${preset}`}
                      className={`py-3 rounded-lg border font-mono font-bold transition ${
                        amount === preset && customAmount === ""
                          ? "border-amber bg-amber/10 text-amber glow-amber"
                          : "border-line-bright bg-bg text-cream hover:border-amber/60"
                      }`}
                    >
                      ₱{preset}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <input
                    type="number"
                    min={20}
                    max={10000}
                    step={1}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="topup-input"
                    placeholder="or enter a custom amount (₱20–₱10,000)"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-4 border border-red-700 bg-red-950/20 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5" />
                  <p className="font-mono text-xs text-red-400">
                    // {errorMsg.replaceAll("_", " ")}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                title="Pay and proceed to checkout"
                className="key-cap key-cap-primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CreditCard className="h-4 w-4" />
                Pay {effectiveAmount > 0 ? formatPHP(effectiveAmount) : "—"}
              </button>

              <p className="font-mono text-[0.65rem] uppercase text-mocha tracking-widest text-center">
                // gcash · maya · card · secured by paymongo
              </p>
            </motion.div>
          )}

          {step === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center"
            >
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full border-4 border-line-bright border-t-amber animate-spin" />
                  <Wallet className="absolute inset-0 m-auto h-7 w-7 text-amber" />
                </div>
              </div>
              <p className="mt-8 font-mono text-sm text-phosphor">
                // creating payment link...
              </p>
              <p className="mt-2 font-mono text-xs text-cream-dim">
                routing to checkout
              </p>
            </motion.div>
          )}

          {step === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
              <p className="mt-6 font-mono text-sm text-red-400">// {errorMsg}</p>
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setErrorMsg(null);
                }}
                title="Try again"
                className="mt-6 key-cap"
              >
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .topup-input {
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
        .topup-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
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
