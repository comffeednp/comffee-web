"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Power,
  ShieldCheck,
  Users,
  Zap,
  AlertTriangle,
} from "lucide-react";
// Calendar is used in SummaryRow below
import { addDays, formatRange, fromDateString, nightsBetween, todayString } from "@/lib/dates";
import { formatPHP } from "@/lib/utils";
import KycVerify, { KycResult } from "@/components/booking/KycVerify";
import BookingCalendar from "@/components/booking/BookingCalendar";

interface Branch {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  hero_image_url: string | null;
  baseNightlyRate: number;
  maxPax: number | null;
  extraPaxFeePhp: number | null;
  maxGuests: number | null;
  securityDepositPhp: number;
}

interface Props {
  branch: Branch;
  initialBlocked: Array<{ check_in: string; check_out: string; source: string }>;
  memberId?: string | null;
  memberName?: string;
  memberEmail?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
}

type Step = "dates" | "guest" | "terms" | "verify" | "review" | "loading" | "paying" | "error";

interface BookingState {
  checkIn: string;
  checkOut: string;
  numGuests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  termsAccepted: boolean;
}

interface AppliedPromo {
  code: string;
  discountPhp: number;
  finalAmountPhp: number;
}

const PROCESSING_FEE_PHP = Number(process.env.NEXT_PUBLIC_PROCESSING_FEE_PHP ?? "150");

export default function BookingClient({ branch, initialBlocked, memberId, memberName, memberEmail, initialCheckIn, initialCheckOut }: Props) {
  const SECURITY_DEPOSIT_PHP = branch.securityDepositPhp;
  const router = useRouter();
  const tomorrow = addDays(todayString(), 1);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const [state, setState] = useState<BookingState>({
    checkIn: initialCheckIn ?? tomorrow,
    checkOut: initialCheckOut ?? addDays(tomorrow, 2),
    numGuests: 2,
    guestName: memberName ?? "",
    guestEmail: memberEmail ?? "",
    guestPhone: "",
    termsAccepted: false,
  });
  const [step, setStep] = useState<Step>("dates");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingReservationId, setPendingReservationId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [kycData, setKycData] = useState<KycResult | null>(null);

  // Promo code state (standalone — not tied to BookingState)
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<AppliedPromo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem("comffe.chat.dates", JSON.stringify({ checkIn: state.checkIn, checkOut: state.checkOut }));
    } catch {}
    return () => { try { sessionStorage.removeItem("comffe.chat.dates"); } catch {} };
  }, [state.checkIn, state.checkOut]);

  useEffect(() => {
    if (!summaryRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setShowScrollHint(false); },
      { threshold: 0.1 },
    );
    obs.observe(summaryRef.current);
    return () => obs.disconnect();
  }, []);

  // Poll reservation status when waiting for PayMongo payment confirmation
  useEffect(() => {
    if (step !== "paying" || !pendingReservationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status?id=${pendingReservationId}`);
        const data = await res.json() as { status?: string };
        if (data.status === "confirmed") {
          clearInterval(interval);
          router.push(`/playcation/${branch.slug}/confirmed/${pendingReservationId}`);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [step, pendingReservationId, branch.slug, router]);

  const nights = nightsBetween(state.checkIn, state.checkOut);
  const extraPax =
    branch.maxPax != null ? Math.max(0, state.numGuests - branch.maxPax) : 0;
  const extraPaxCharge =
    extraPax > 0 && branch.extraPaxFeePhp ? extraPax * branch.extraPaxFeePhp * nights : 0;
  const subtotal = nights * branch.baseNightlyRate + extraPaxCharge;
  const accommodationTotal = promoApplied ? promoApplied.finalAmountPhp : subtotal;
  const reservationFee = Math.ceil(accommodationTotal * 0.30);
  const balancePhp = accommodationTotal - reservationFee;
  // Balance for a 30% booking is due 3 days before check-in. Compute the gate the
  // exact same way the server does (PH calendar dates, string-compared) so the
  // partial option is never offered when /api/payments/create-intent would reject
  // it with "partial_not_allowed_close_checkin".
  const balanceDueStr = addDays(state.checkIn, -3); // YYYY-MM-DD
  const balanceDueDate = fromDateString(balanceDueStr).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const phTodayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const partialAllowed = balanceDueStr > addDays(phTodayStr, 1);
  const dueNow = (paymentType === "partial" && partialAllowed ? reservationFee : accommodationTotal) + SECURITY_DEPOSIT_PHP + PROCESSING_FEE_PHP;
  const total = accommodationTotal + SECURITY_DEPOSIT_PHP + PROCESSING_FEE_PHP;

  const handleApplyPromo = async () => {
    if (!promoCode.trim() || subtotal <= 0) return;
    setPromoChecking(true);
    setPromoError(null);
    try {
      const res = await fetch("/api/promo-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoCode.trim(),
          amountPhp: subtotal,
          target: "reservation",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error ?? "invalid");
        setPromoApplied(null);
      } else {
        setPromoApplied({
          code: data.code,
          discountPhp: data.discountPhp,
          finalAmountPhp: data.finalAmountPhp,
        });
      }
    } catch {
      setPromoError("network_error");
    } finally {
      setPromoChecking(false);
    }
  };

  const removePromo = () => {
    setPromoApplied(null);
    setPromoCode("");
    setPromoError(null);
  };

  // Naive client-side conflict detection — server is the source of truth.
  const hasOverlap = initialBlocked.some(
    (b) => b.check_in < state.checkOut && b.check_out > state.checkIn,
  );

  const datesValid = nights >= 1 && !hasOverlap;

  const handleSubmit = () => {
    if (!state.guestName.trim()) {
      setErrorMsg("Name is required");
      return;
    }
    if (!kycData) {
      setErrorMsg("Complete identity verification first");
      return;
    }
    setErrorMsg(null);
    setStep("loading");

    startTransition(async () => {
      try {
        const res = await fetch("/api/payments/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId: branch.id,
            checkIn: state.checkIn,
            checkOut: state.checkOut,
            numGuests: state.numGuests,
            guestName: state.guestName,
            guestEmail: state.guestEmail,
            guestPhone: state.guestPhone,
            promoCode: promoApplied?.code ?? "",
            paymentType,
            memberId: memberId ?? null,
            kycSelfieUrl: kycData.selfieUrl,
            kycIdUrl: kycData.idUrl,
            kycBillingUrl: kycData.billingUrl,
            kycIpAddress: kycData.ipAddress ?? null,
            kycLatitude: kycData.latitude ?? null,
            kycLongitude: kycData.longitude ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStep("error");
          setErrorMsg(data.error ?? "booking failed");
          return;
        }
        if (data.checkoutUrl) {
          window.open(data.checkoutUrl, "_blank", "noopener");
          setPendingReservationId(data.reservationId);
          setStep("paying");
          return;
        }
        if (data.simulated && data.reservationId) {
          router.push(`/playcation/${branch.slug}/confirmed/${data.reservationId}`);
          return;
        }
        setStep("error");
        setErrorMsg("unexpected response from server");
      } catch (e) {
        setStep("error");
        setErrorMsg(e instanceof Error ? e.message : "network error");
      }
    });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[2fr_1fr] min-w-0 overflow-x-hidden">
      {/* ============================================================
          LEFT — booking flow
          ============================================================ */}
      <div className="border border-line-bright bg-bg-card rounded-2xl overflow-hidden">
        <div className="border-b border-line bg-bg-soft px-3 sm:px-6 py-4 flex items-center gap-1 sm:gap-2 font-mono text-[0.7rem] uppercase tracking-tight sm:tracking-[0.12em] overflow-hidden">
          <StepDot active={["dates","guest","terms","verify","review","loading"].includes(step)} done={["guest","terms","verify","review","loading"].includes(step)} label="01 dates" />
          <ChevronRight className="h-3 w-3 text-mocha" />
          <StepDot active={["guest","terms","verify","review","loading"].includes(step)} done={["terms","verify","review","loading"].includes(step)} label="02 guest" />
          <ChevronRight className="h-3 w-3 text-mocha" />
          <StepDot active={["terms","verify","review","loading"].includes(step)} done={["verify","review","loading"].includes(step)} label="03 terms" />
          <ChevronRight className="h-3 w-3 text-mocha" />
          <StepDot active={["verify","review","loading"].includes(step)} done={["review","loading"].includes(step)} label="04 verify" />
          <ChevronRight className="h-3 w-3 text-mocha" />
          <StepDot active={["review","loading"].includes(step)} done={["loading"].includes(step)} label="05 confirm" />
        </div>

        <div className="p-6 md:p-10 min-h-[400px]">
          <AnimatePresence mode="wait">
            {/* ----- STEP 1: DATES ----- */}
            {step === "dates" && (
              <motion.div
                key="dates"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <p className="terminal-label">step.01 // pick_dates</p>
                <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold text-cream tracking-tight">
                  When do you want to power on?
                </h2>
                <p className="mt-3 text-cream-dim">
                  Live availability — synced with our Airbnb listings, no double bookings.
                </p>

                <div className="mt-8">
                  <BookingCalendar
                    blocked={initialBlocked}
                    checkIn={state.checkIn}
                    checkOut={state.checkOut}
                    onChange={({ checkIn, checkOut }) =>
                      setState(s => ({ ...s, checkIn, checkOut }))
                    }
                  />
                </div>

                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem("comffe.chat.branch", JSON.stringify({ id: branch.id, name: branch.name }));
                        sessionStorage.setItem("comffe.chat.dates", JSON.stringify({ checkIn: state.checkIn, checkOut: state.checkOut }));
                        sessionStorage.setItem("comffe.chat.guests", String(state.numGuests));
                      } catch {}
                      window.dispatchEvent(new CustomEvent("comffe:open-chat", { detail: { inquiry: true } }));
                    }}
                    className="inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim hover:text-amber transition"
                  >
                    <MessageSquare className="h-3 w-3" />
                    Message host
                  </button>
                </div>

                <Field label={`number of guests${branch.maxGuests ? ` — max ${branch.maxGuests}` : ""}`}>
                  <select
                    value={state.numGuests}
                    onChange={(e) =>
                      setState((s) => ({ ...s, numGuests: Number(e.target.value) }))
                    }
                    className="booking-input mt-5 max-w-[12rem]"
                  >
                    {Array.from({ length: branch.maxGuests ?? 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "guest" : "guests"}
                        {branch.maxPax != null && n > branch.maxPax
                          ? ` (+₱${((n - branch.maxPax) * (branch.extraPaxFeePhp ?? 0)).toLocaleString()} extra)`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="mt-8 p-4 border border-line rounded-lg bg-bg flex items-center gap-3">
                  {hasOverlap ? (
                    <>
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                      <span className="font-mono text-sm text-red-400">
                        // CONFLICT — those dates overlap an existing booking
                      </span>
                    </>
                  ) : nights < 1 ? (
                    <>
                      <AlertTriangle className="h-5 w-5 text-amber" />
                      <span className="font-mono text-sm text-amber">
                        // pick at least 1 night
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-phosphor animate-pulse shadow-[0_0_8px_var(--color-phosphor)]" />
                      <span className="font-mono text-sm text-phosphor">
                        // SLOT AVAILABLE — {nights} {nights === 1 ? "night" : "nights"} ·{" "}
                        {formatPHP(total)}
                      </span>
                    </>
                  )}
                </div>

                {/* PROMO CODE — step 1 */}
                <div className="mt-6">
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor mb-2">
                    // voucher code (optional)
                  </p>
                  {promoApplied ? (
                    <div className="flex items-center justify-between p-3 border border-phosphor/40 rounded-lg bg-phosphor/5">
                      <span className="font-mono text-sm font-bold text-phosphor">
                        ✓ {promoApplied.code} · -{formatPHP(promoApplied.discountPhp)}
                      </span>
                      <button
                        type="button"
                        onClick={removePromo}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha hover:text-amber"
                      >
                        remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => {
                          setPromoCode(e.target.value.toUpperCase());
                          setPromoError(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                        placeholder="ENTER CODE"
                        className="booking-input uppercase flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={promoChecking || !promoCode.trim() || subtotal <= 0}
                        className="key-cap !py-2 !px-4 disabled:opacity-40"
                      >
                        {promoChecking ? "…" : "Apply"}
                      </button>
                    </div>
                  )}
                  {promoError && (
                    <p className="mt-2 font-mono text-xs text-red-400">
                      // {promoError.replaceAll("_", " ")}
                    </p>
                  )}
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={() => datesValid && setStep("guest")}
                    disabled={!datesValid}
                    className="key-cap key-cap-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {showScrollHint && (
                  <div className="mt-4 flex justify-center lg:hidden">
                    <button
                      type="button"
                      onClick={() => {
                        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        setShowScrollHint(false);
                      }}
                      className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-mocha hover:text-cream-dim transition animate-bounce"
                    >
                      <ChevronDown className="h-3 w-3" />
                      See price breakdown
                    </button>
                  </div>
                )}

                {/* Mobile sticky total — visible only on small screens */}
                <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden pointer-events-none">
                  <div className="mx-3 mb-3 pointer-events-auto">
                    <div className="bg-bg-card/95 backdrop-blur-md border border-line-bright rounded-xl px-4 py-3 flex items-center justify-between shadow-xl shadow-black/40 pr-28">
                      {hasOverlap ? (
                        <span className="font-mono text-xs text-red-400">// date conflict</span>
                      ) : nights < 1 ? (
                        <span className="font-mono text-xs text-amber">// select dates</span>
                      ) : (
                        <div>
                          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">{nights} {nights === 1 ? "night" : "nights"} · {formatPHP(branch.baseNightlyRate)}/night</span>
                          <p className="font-display text-xl font-bold text-amber leading-tight">{formatPHP(total)}</p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => datesValid && setStep("guest")}
                        disabled={!datesValid}
                        className="key-cap key-cap-primary !py-2 !px-4 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        Continue
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ----- STEP 2: GUEST INFO ----- */}
            {step === "guest" && (
              <motion.div
                key="guest"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <p className="terminal-label">step.02 // guest_info</p>
                <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold text-cream tracking-tight">
                  Who&apos;s checking in?
                </h2>
                <p className="mt-3 text-cream-dim">
                  We&apos;ll send confirmation here. Phone number lets us reach you fast if needed.
                </p>

                <div className="mt-8 space-y-5">
                  <Field label="full name *">
                    <input
                      type="text"
                      required
                      value={state.guestName}
                      onChange={(e) =>
                        setState((s) => ({ ...s, guestName: e.target.value }))
                      }
                      className="booking-input"
                      placeholder="Player one"
                    />
                  </Field>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="email">
                      <input
                        type="email"
                        value={state.guestEmail}
                        onChange={(e) =>
                          setState((s) => ({ ...s, guestEmail: e.target.value }))
                        }
                        className="booking-input"
                        placeholder="you@example.com"
                      />
                    </Field>
                    <Field label="phone">
                      <input
                        type="tel"
                        value={state.guestPhone}
                        onChange={(e) =>
                          setState((s) => ({ ...s, guestPhone: e.target.value }))
                        }
                        className="booking-input"
                        placeholder="+63 9XX XXX XXXX"
                      />
                    </Field>
                  </div>
                </div>

                {errorMsg && (
                  <p className="mt-4 font-mono text-xs text-red-400">// {errorMsg}</p>
                )}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep("dates")}
                    className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
                  >
                    ← back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!state.guestName.trim()) {
                        setErrorMsg("name is required");
                        return;
                      }
                      setErrorMsg(null);
                      setStep("terms");
                    }}
                    className="key-cap key-cap-primary"
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ----- STEP 3: TERMS ----- */}
            {step === "terms" && (
              <motion.div
                key="terms"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <p className="terminal-label">step.03 // terms_and_conditions</p>
                <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold text-cream tracking-tight">
                  Before you check in.
                </h2>
                <p className="mt-3 text-cream-dim text-sm">
                  Read carefully. By proceeding you accept legal responsibility for the unit and its contents.
                </p>

                <div className="mt-6 h-72 overflow-y-auto border border-line rounded-xl bg-bg p-5 text-[0.78rem] text-cream-dim leading-relaxed space-y-4 font-mono scrollbar-thin">
                  <p className="text-amber font-bold text-xs uppercase tracking-widest">COMFFEE PLAYCATION — GUEST TERMS &amp; CONDITIONS</p>
                  <p className="text-mocha text-[0.65rem]">Effective date: {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })} · Applies to all Comffee Playcation branches</p>

                  <Section3Head>1. ACCEPTANCE OF TERMS</Section3Head>
                  <p>By completing this booking you ("Guest") confirm that you have read, understood, and agree to be legally bound by these Terms and Conditions ("Terms"). If you do not agree, do not proceed with the booking. These Terms constitute a binding legal agreement between you and Comffee Internet Cafe &amp; Gaming Staycation ("Comffee", "we", "us").</p>

                  <Section3Head>2. BOOKING, CONFIRMATION &amp; PAYMENT</Section3Head>
                  <p>2.1 A reservation is confirmed only upon receipt of full payment or successful placement of a payment hold via our authorized payment gateway (PayMongo).</p>
                  <p>2.2 Comffee reserves the right to cancel any booking that it reasonably suspects involves fraud, misrepresentation, or violation of these Terms, without refund.</p>
                  <p>2.3 Prices are in Philippine Pesos (₱) and are inclusive of applicable taxes unless stated otherwise.</p>

                  <Section3Head>3. CHECK-IN &amp; CHECK-OUT</Section3Head>
                  <p>3.1 Standard check-in is 2:00 PM and check-out is 11:00 AM unless otherwise agreed in writing. Late check-out beyond 12:00 PM without prior approval may incur a fee equivalent to one additional night's rate.</p>
                  <p>3.2 Guest must present a valid government-issued photo ID (e.g., PhilSys, Driver's License, Passport, UMID, SSS, PRC ID) upon check-in. The name on the ID must match the name on the reservation. We reserve the right to refuse check-in if IDs do not match.</p>
                  <p>3.3 Only the number of guests declared during booking are permitted inside the unit. Unregistered guests are strictly prohibited. Violation results in immediate eviction without refund.</p>

                  <Section3Head>4. IDENTITY VERIFICATION &amp; DATA CONSENT</Section3Head>
                  <p>4.1 To protect the safety of our property and other guests, Comffee may require identity verification including government ID upload, selfie capture, and biometric liveness checks as part of the booking or check-in process.</p>
                  <p>4.2 By accepting these Terms, Guest explicitly consents to the collection, storage, and processing of personal data including but not limited to: full name, contact information, photo ID image, facial biometric data, and IP address, for the sole purposes of identity verification, fraud prevention, and dispute resolution.</p>
                  <p>4.3 This data is stored securely and will not be shared with third parties except as required by Philippine law (Republic Act No. 10173 — Data Privacy Act of 2012) or as necessary to prevent or report a crime.</p>

                  <Section3Head>5. PROPERTY DAMAGE &amp; LIABILITY</Section3Head>
                  <p>5.1 Guest accepts full financial responsibility for any damage to the unit, furniture, appliances, gaming equipment, peripherals, fixtures, or any property belonging to Comffee that occurs during their stay, regardless of whether such damage was accidental or intentional.</p>
                  <p>5.2 Damage will be assessed by Comffee upon checkout. Guest agrees to pay the replacement or repair cost in full within 48 hours of receiving a written assessment. Comffee reserves the right to charge the Guest's payment method on file or pursue civil remedies.</p>
                  <p>5.3 The minimum assessment for damaged gaming peripherals (controllers, keyboards, mice, headsets) is ₱500 per item. For monitors, PCs, or consoles, the cost is the current market replacement price.</p>
                  <p>5.4 Guest is responsible for any damage caused by their registered guests, minors in their care, or any person they allow into the unit.</p>

                  <Section3Head>6. THEFT &amp; CRIMINAL LIABILITY</Section3Head>
                  <p>6.1 The taking, concealment, or unauthorized removal of any property belonging to Comffee — including but not limited to controllers, remote controls, cables, adapters, gaming cartridges, toiletries, linens, appliances, or any other item — constitutes theft under Republic Act No. 3815 (The Revised Penal Code of the Philippines) and will be prosecuted to the fullest extent of the law.</p>
                  <p>6.2 Comffee maintains an inventory record of all unit contents before and after each stay. Guest acknowledges that CCTV cameras operate in common areas and at the unit entrance.</p>
                  <p>6.3 Guest identity, booking records, payment information, and any biometric verification data will be submitted to law enforcement upon request or in the event of theft or property damage exceeding ₱5,000.</p>
                  <p>6.4 Comffee reserves the right to share Guest information with other accommodation operators to prevent repeat offenses.</p>

                  <Section3Head>7. SECURITY DEPOSIT</Section3Head>
                  <p>7.1 A mandatory refundable security deposit of ₱1,000 is collected together with the accommodation payment at the time of booking. This deposit is separate from the accommodation rate.</p>
                  <p>7.2 The deposit is released within 24–48 hours after a satisfactory checkout inspection with no violations, complaints, damages, or missing items. Refund is processed via the original payment method.</p>
                  <p>7.3 Comffee may withhold part or all of the deposit for any of the following: visible stains on linens, mattress, furniture, walls, or flooring; noise complaints received from neighbors or building administration; missing items from the unit inventory; unauthorized guests beyond the declared count; excessive cleaning required beyond normal use; smoking inside the unit; or any violation of these Terms or building house rules.</p>
                  <p>7.4 If damages or violations result in charges exceeding ₱1,000, Guest remains fully liable for the outstanding balance above the deposit amount.</p>

                  <Section3Head>8. HOUSE RULES &amp; BUILDING REGULATIONS</Section3Head>
                  <p>8.1 No smoking of any kind (cigarettes, vapes, e-cigarettes) is permitted inside the unit, on the balcony, or in any indoor common area. Violation incurs a minimum ₱2,000 cleaning fee charged to the Guest, in addition to applicable building fines.</p>
                  <p>8.2 <strong>NO PETS ALLOWED.</strong> Pets of any kind — including dogs, cats, birds, and all other animals — are strictly prohibited inside the unit and building premises at all times, with absolutely no exceptions. This is a hard building rule with no override by Comffee. Violation results in immediate eviction without refund.</p>
                  <p>8.3 Quiet hours are strictly observed from 10:00 PM to 8:00 AM. Any noise disturbance reported to building administration constitutes a Major violation under building rules, subject to fines of ₱2,000–₱4,000 charged directly to the Guest. Grave noise violations (loud music, parties, repeated disturbances) are subject to fines of up to ₱5,000 and endorsement to legal action.</p>
                  <p>8.4 Parties, events, or gatherings that exceed the declared guest count are strictly prohibited. Unregistered guests discovered inside the unit will result in immediate eviction without refund.</p>
                  <p>8.5 Waste must be disposed of properly using designated bins and collection schedules. Leaving trash in hallways, fire exits, elevator lobbies, or common areas violates building rules and incurs building fines of ₱1,000–₱3,000 charged to the Guest.</p>
                  <p>8.6 Illegal parking in building-designated spaces not assigned to the unit is subject to a ₱5,000 building fine charged to the Guest.</p>
                  <p>8.7 Guests are responsible for returning the unit in the condition it was received. Excessive mess, uncleaned food, or strong odors requiring deep cleaning will incur a cleaning surcharge of ₱500–₱2,000 deducted from the security deposit.</p>
                  <p>8.8 Illegal substances, weapons, and items prohibited by Philippine law are not permitted on the premises. Discovery of such items will result in immediate eviction and reporting to authorities.</p>
                  <p className="text-mocha text-[0.65rem]">// Building fines cited above are imposed by Infina Towers building administration and will be passed directly to the Guest responsible for the violation.</p>

                  <Section3Head>9. GAMING EQUIPMENT RULES</Section3Head>
                  <p>9.1 Gaming PCs, consoles, controllers, and peripherals are provided for entertainment use only. Guests must not install unauthorized software, modify system settings, access BIOS or admin-level settings, or tamper with any hardware.</p>
                  <p>9.2 Comffee is not responsible for loss of in-game data, saved files, or progress. Guests are advised to use their own accounts and log out before checkout.</p>
                  <p>9.3 Food and liquids near gaming equipment are at Guest's own risk. Spills that damage equipment will be charged to the Guest.</p>

                  <Section3Head>10. CANCELLATION &amp; REFUND POLICY</Section3Head>
                  <p>10.1 <strong>All Payments Non-Refundable.</strong> All bookings are strictly non-refundable. No refund will be issued for any cancellation, reschedule, no-show, or early checkout initiated by the Guest, regardless of reason or timing. This applies to both the full-payment option and the 30% reservation fee option.</p>
                  <p>10.2 <strong>Partial Payment — Balance Due.</strong> If the 30% reservation fee option was selected, the remaining 70% balance is due no later than 3 days before the check-in date. Failure to remit the balance by the due date constitutes automatic cancellation of the reservation; the 30% reservation fee and security deposit are forfeited with no refund.</p>
                  <p>10.3 <strong>Security Deposit Refund.</strong> The ₱1,000 security deposit is refundable only upon satisfactory checkout inspection with no violations, damages, missing items, or complaints, regardless of whether the stay was completed. The deposit is processed within 24–48 hours after checkout via the original payment method.</p>
                  <p>10.4 <strong>Comffee-Initiated Cancellation — Full Refund Guaranteed.</strong> If Comffee cancels a confirmed reservation for any reason not caused by Guest violation of these Terms — including but not limited to overbooking, double booking, scheduling conflicts, administrative errors, force majeure events (natural disasters, government-mandated closures, utility failures), or property issues beyond Comffee's control — the Guest is entitled to a full refund of all amounts paid, including the security deposit. The refund will be initiated to the original payment method within 10 calendar days. Comffee is not responsible for delays caused by the Guest's bank or e-wallet provider once the refund has been issued.</p>
                  <p>10.5 <strong>No Refund for Violations.</strong> Eviction resulting from violation of these Terms (unauthorized guests, noise complaints, smoking, pets, damage, or any prohibited activity) does not entitle the Guest to any refund of accommodation fees or security deposit.</p>
                  <p>10.6 By completing the booking, the Guest expressly acknowledges and agrees to this non-refundable payment policy as required under Republic Act No. 7394 (Consumer Act of the Philippines). Comffee's cancellation policy has been clearly disclosed prior to payment in accordance with applicable Philippine consumer protection law.</p>
                  <p>10.7 <strong>Refund Method for QR Ph Payments.</strong> If payment was made via QR Ph (InstaPay / GCash QR) and Comffee initiates a cancellation under Section 10.4, PayMongo's gateway does not support automatic API refunds for this payment type. Comffee will manually issue the refund via GCash or InstaPay to the mobile number provided at the time of booking within 10 calendar days of the cancellation. Guest agrees to ensure the mobile number on the reservation is active and capable of receiving GCash transfers. Comffee is not liable for delays caused by an incorrect or inactive mobile number provided by the Guest.</p>

                  <Section3Head>11. PROHIBITED ACTIVITIES</Section3Head>
                  <p>The following are strictly prohibited and will result in immediate eviction without refund and potential legal action: subletting the unit; using the unit for commercial filming, adult content, or illegal activities; accessing neighboring units; tampering with locks or security systems; conducting any business activity without written consent from Comffee.</p>

                  <Section3Head>12. LIMITATION OF LIABILITY</Section3Head>
                  <p>12.1 Comffee is not liable for theft, loss, or damage to Guest's personal belongings during the stay. Guests are advised to secure valuables.</p>
                  <p>12.2 Comffee's total liability to any Guest for any claim arising from a booking shall not exceed the total amount paid by the Guest for that specific stay.</p>
                  <p>12.3 Comffee is not responsible for service interruptions caused by third parties (internet service providers, building administration, utility companies).</p>

                  <Section3Head>13. GOVERNING LAW &amp; DISPUTES</Section3Head>
                  <p>These Terms are governed by the laws of the Republic of the Philippines. Any dispute arising from a booking shall first be submitted to good-faith negotiation. If unresolved within 30 days, disputes shall be settled by the appropriate courts of Quezon City, Metro Manila, Philippines, to the exclusion of all other venues.</p>

                  <Section3Head>14. AMENDMENTS</Section3Head>
                  <p>Comffee reserves the right to update these Terms at any time. The version in effect at the time of booking applies to that reservation. Continued use of our booking platform constitutes acceptance of the updated Terms.</p>

                  <p className="text-mocha text-[0.65rem] pt-2">// COMFFEE INTERNET CAFE &amp; GAMING STAYCATION · comffeeinternetcafe@gmail.com</p>
                </div>

                <div className="mt-5 p-4 border border-line-bright rounded-xl bg-bg">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.termsAccepted}
                      onChange={(e) => setState((s) => ({ ...s, termsAccepted: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 accent-amber shrink-0"
                    />
                    <span className="text-sm text-cream-dim leading-relaxed">
                      I have read and fully understand the Terms &amp; Conditions above. I accept full legal responsibility for the unit, its contents, and the conduct of all guests in my party. I consent to identity verification and data processing as described in Section 4.
                    </span>
                  </label>
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep("guest")}
                    className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
                  >
                    ← back
                  </button>
                  <button
                    type="button"
                    onClick={() => state.termsAccepted && setStep("verify")}
                    disabled={!state.termsAccepted}
                    className="key-cap key-cap-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    I agree — Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ----- STEP 4: IDENTITY VERIFICATION ----- */}
            {step === "verify" && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <p className="terminal-label">step.04 // identity_verification</p>
                <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold text-cream tracking-tight">
                  Verify your identity.
                </h2>
                <p className="mt-3 text-cream-dim text-sm">
                  Selfie, government ID, and proof of billing. Required for all playcation reservations.
                </p>

                <div className="mt-6">
                  <KycVerify
                    memberId={memberId ?? ""}
                    onComplete={(result) => {
                      setKycData(result);
                      setStep("review");
                    }}
                    onFail={(msg) => setErrorMsg(msg)}
                  />
                  {errorMsg && (
                    <p className="mt-4 font-mono text-xs text-red-400">// {errorMsg}</p>
                  )}
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setStep("terms")}
                    className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
                  >
                    ← back
                  </button>
                </div>
              </motion.div>
            )}

            {/* ----- STEP 5: REVIEW ----- */}
            {step === "review" && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <p className="terminal-label">step.05 // confirm_and_pay</p>
                <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold text-cream tracking-tight">
                  Last check before launch.
                </h2>

                <div className="mt-8 monitor-frame">
                  <div className="monitor-screen p-6 space-y-3 font-mono text-sm">
                    <Row label="branch" value={branch.name} />
                    <Row label="dates" value={formatRange(state.checkIn, state.checkOut)} />
                    <Row label="nights" value={String(nights)} />
                    <Row
                      label="guests"
                      value={`${state.numGuests}${branch.maxPax != null ? ` (${branch.maxPax} incl. in base rate)` : ""}`}
                    />
                    {extraPaxCharge > 0 && (
                      <Row label={`extra pax fee (${extraPax} × ${formatPHP(branch.extraPaxFeePhp!)} × ${nights}n)`} value={formatPHP(extraPaxCharge)} />
                    )}
                    <Row label="guest" value={state.guestName} />
                    {state.guestEmail && <Row label="email" value={state.guestEmail} />}
                    {state.guestPhone && <Row label="phone" value={state.guestPhone} />}
                    {promoApplied && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-phosphor uppercase tracking-widest text-[0.65rem]">
                          // {promoApplied.code}
                        </span>
                        <span className="text-phosphor">
                          -{formatPHP(promoApplied.discountPhp)}
                        </span>
                      </div>
                    )}
                    <div className="pt-3 mt-3 border-t border-line flex justify-between items-baseline">
                      <span className="text-mocha uppercase tracking-widest text-[0.65rem]">
                        // total
                      </span>
                      <span className="text-3xl font-display font-bold text-amber text-glow-amber">
                        {formatPHP(total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PAYMENT TYPE */}
                <div className="mt-6">
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor mb-3">
                    // payment option
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Full payment */}
                    <button
                      type="button"
                      onClick={() => setPaymentType("full")}
                      className={`text-left p-4 rounded-xl border transition ${
                        paymentType === "full"
                          ? "border-amber/60 bg-amber/5"
                          : "border-line-bright hover:border-amber/30"
                      }`}
                    >
                      <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor">Pay in full</p>
                      <p className="mt-1 font-display text-xl font-bold text-cream">{formatPHP(total)}</p>
                      <p className="mt-1 text-xs text-cream-dim">Accommodation + ₱1,000 deposit</p>
                      <p className="mt-2 font-mono text-[0.6rem] text-mocha">Non-refundable after 24hrs of booking</p>
                    </button>
                    {/* 30% partial */}
                    {partialAllowed ? (
                      <button
                        type="button"
                        onClick={() => setPaymentType("partial")}
                        className={`text-left p-4 rounded-xl border transition ${
                          paymentType === "partial"
                            ? "border-amber/60 bg-amber/5"
                            : "border-line-bright hover:border-amber/30"
                        }`}
                      >
                        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor">Reserve with 30%</p>
                        <p className="mt-1 font-display text-xl font-bold text-cream">{formatPHP(dueNow)} <span className="text-sm text-mocha font-sans font-normal">now</span></p>
                        <p className="mt-1 text-xs text-cream-dim">30% fee + ₱1,000 deposit</p>
                        <p className="mt-1 text-xs text-amber font-mono">Balance {formatPHP(balancePhp)} due {balanceDueDate}</p>
                        <p className="mt-1 font-mono text-[0.6rem] text-mocha">Both payments non-refundable after 24hrs</p>
                      </button>
                    ) : (
                      <div className="text-left p-4 rounded-xl border border-line opacity-40 cursor-not-allowed">
                        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor">Reserve with 30%</p>
                        <p className="mt-1 text-xs text-mocha">Not available — check-in is too soon for a partial payment plan.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* PROMO CODE */}
                <div className="mt-6">
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor mb-2">
                    // promo code (optional)
                  </p>
                  {promoApplied ? (
                    <div className="flex items-center justify-between p-3 border border-phosphor/40 rounded-lg bg-phosphor/5">
                      <span className="font-mono text-sm font-bold text-phosphor">
                        ✓ {promoApplied.code} · -{formatPHP(promoApplied.discountPhp)}
                      </span>
                      <button
                        type="button"
                        onClick={removePromo}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha hover:text-amber"
                      >
                        remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="ENTER CODE"
                        className="booking-input uppercase flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={promoChecking || !promoCode.trim()}
                        className="key-cap !py-2 !px-4 disabled:opacity-40"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  {promoError && (
                    <p className="mt-2 font-mono text-xs text-red-400">
                      // {promoError.replaceAll("_", " ")}
                    </p>
                  )}
                </div>

                {errorMsg && (
                  <p className="mt-4 font-mono text-xs text-red-400">// {errorMsg}</p>
                )}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep("verify")}
                    className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
                  >
                    ← back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isPending}
                    className="key-cap key-cap-primary"
                  >
                    <Power className="h-4 w-4" />
                    Power on & pay
                  </button>
                </div>
              </motion.div>
            )}

            {/* ----- STEP 4: LOADING ----- */}
            {step === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-20 text-center"
              >
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-line-bright border-t-amber animate-spin" />
                    <Power className="absolute inset-0 m-auto h-7 w-7 text-amber" />
                  </div>
                </div>
                <p className="mt-8 font-mono text-sm text-phosphor">
                  // RESERVING SLOT...
                </p>
                <p className="mt-2 font-mono text-xs text-cream-dim">
                  locking your dates · creating payment link · routing to checkout
                </p>
                <div className="mt-8 mx-auto max-w-xs h-1 bg-line-bright rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-amber"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            )}

            {/* ----- PAYING ----- */}
            {step === "paying" && (
              <motion.div
                key="paying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-20 text-center space-y-6"
              >
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-line-bright border-t-amber animate-spin" />
                    <Power className="absolute inset-0 m-auto h-7 w-7 text-amber" />
                  </div>
                </div>
                <div>
                  <p className="font-mono text-sm text-phosphor">// WAITING FOR PAYMENT...</p>
                  <p className="mt-2 font-mono text-xs text-cream-dim max-w-xs mx-auto">
                    Complete your payment in the tab that just opened. This page will automatically redirect once confirmed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingReservationId) {
                      router.push(`/playcation/${branch.slug}/confirmed/${pendingReservationId}`);
                    }
                  }}
                  className="key-cap font-mono text-xs"
                >
                  I&apos;ve already paid → view booking
                </button>
              </motion.div>
            )}

            {/* ----- ERROR ----- */}
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
                  onClick={() => {
                    setStep("dates");
                    setErrorMsg(null);
                  }}
                  className="mt-6 key-cap"
                >
                  Try again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ============================================================
          RIGHT — sticky summary
          ============================================================ */}
      <aside ref={summaryRef} className="lg:sticky lg:top-24 self-start">
        <div className="border border-line-bright bg-bg-card rounded-2xl overflow-hidden">
          {branch.hero_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branch.hero_image_url}
              alt={branch.name}
              className="w-full aspect-[16/10] object-cover"
            />
          )}
          <div className="p-6 space-y-4">
            <div>
              <p className="terminal-label">// booking.summary</p>
              <h3 className="mt-2 font-display text-2xl font-bold text-cream">{branch.name}</h3>
              {branch.city && (
                <p className="mt-1 text-sm text-cream-dim">{branch.city}</p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <SummaryRow
                icon={Calendar}
                label="dates"
                value={formatRange(state.checkIn, state.checkOut)}
              />
              <SummaryRow
                icon={Zap}
                label="nights"
                value={`${nights} × ${formatPHP(branch.baseNightlyRate)}`}
              />
              <SummaryRow
                icon={Users}
                label="guests"
                value={`${state.numGuests}${branch.maxPax != null ? ` (${branch.maxPax} incl.)` : ""}`}
              />
              {extraPaxCharge > 0 && (
                <SummaryRow
                  icon={Users}
                  label={`+${extraPax} extra pax`}
                  value={formatPHP(extraPaxCharge)}
                />
              )}
              {promoApplied && (
                <SummaryRow
                  icon={Zap}
                  label="discount"
                  value={`-${formatPHP(promoApplied.discountPhp)}`}
                />
              )}
              <SummaryRow
                icon={ShieldCheck}
                label="security deposit"
                value={`+${formatPHP(SECURITY_DEPOSIT_PHP)} refundable`}
              />
              <SummaryRow
                icon={Zap}
                label="processing fee"
                value={`+${formatPHP(PROCESSING_FEE_PHP)}`}
              />
            </div>

            <div className="pt-4 border-t border-line space-y-2">
              {paymentType === "partial" && partialAllowed && (
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">// balance due {balanceDueDate}</span>
                  <span className="font-mono text-sm text-cream-dim">{formatPHP(balancePhp)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">
                  {paymentType === "partial" && partialAllowed ? "// due now" : "// total charged"}
                </span>
                <span className="text-2xl font-display font-bold text-amber">
                  {formatPHP(dueNow)}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-line flex items-start gap-2 text-[0.7rem] font-mono uppercase tracking-widest text-mocha">
              <ShieldCheck className="h-3 w-3 mt-0.5 text-phosphor" />
              <span>20-min hold from checkout · cancel free until confirmation</span>
            </div>
          </div>
        </div>
      </aside>

      <style>{`
        .booking-input {
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
        .booking-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4), 0 0 16px rgba(255,181,71,0.15);
        }
      `}</style>
    </div>
  );
}

function Section3Head({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-amber text-[0.7rem] uppercase tracking-widest font-bold pt-2">{children}</p>
  );
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  const [num, ...rest] = label.split(" ");
  return (
    <span
      className={`flex items-center gap-1 sm:gap-1.5 ${
        done ? "text-phosphor" : active ? "text-amber" : "text-mocha"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          done
            ? "bg-phosphor shadow-[0_0_6px_var(--color-phosphor)]"
            : active
            ? "bg-amber shadow-[0_0_6px_var(--color-amber)]"
            : "bg-mocha"
        }`}
      />
      <span className="tabular-nums">{num}</span>
      <span className="hidden sm:inline">{rest.join(" ")}</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
        // {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-mocha uppercase tracking-widest text-[0.65rem] shrink-0">
        // {label}
      </span>
      <span className="text-cream text-right truncate">{value}</span>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-2 text-mocha uppercase tracking-widest text-[0.65rem] font-mono">
        <Icon className="h-3 w-3 text-amber" />
        {label}
      </span>
      <span className="text-cream text-right text-xs">{value}</span>
    </div>
  );
}
