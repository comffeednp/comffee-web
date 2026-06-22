import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyLookupToken } from "@/lib/lookup-token";
import { formatPHP, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

/**
 * One-click booking view linked from the confirmation email: /b/<id>?t=<token>.
 *
 * Pure server-rendered (no client components, no client fetch) so it can never
 * get stuck on a loading state. The HMAC token authorises showing the booking
 * without the /lookup contact challenge. Lives OUTSIDE the (site) layout so it
 * doesn't depend on the global header/settings render.
 */
export default async function BookingViewPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;

  if (!verifyLookupToken(id, t)) {
    return (
      <Shell>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">{"// link expired"}</p>
        <h1 className="mt-3 font-sans text-3xl font-bold text-cream">This booking link isn&rsquo;t valid</h1>
        <p className="mt-4 text-cream-dim">
          For your security, the link may have expired. Look up your booking with your reservation ID and the email you used.
        </p>
        <Link href="/lookup" className="mt-8 inline-block rounded-lg bg-amber px-6 py-3 font-bold text-bg">
          Look up my booking
        </Link>
      </Shell>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: r } = await supabase
    .from("reservations")
    .select(
      "id, status, check_in, check_out, num_guests, total_php, payment_type, balance_php, balance_due_date, balance_paid_at, security_deposit_php, guest_name, branch:branches(name, slug)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!r) {
    return (
      <Shell>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber">{"// not found"}</p>
        <h1 className="mt-3 font-sans text-3xl font-bold text-cream">We couldn&rsquo;t find that booking</h1>
        <Link href="/lookup" className="mt-8 inline-block rounded-lg bg-amber px-6 py-3 font-bold text-bg">
          Look up my booking
        </Link>
      </Shell>
    );
  }

  const branch = (Array.isArray(r.branch) ? r.branch[0] : r.branch) as { name?: string } | null;
  const confirmed = r.status === "confirmed";
  const balanceDue =
    r.payment_type === "partial" && Number(r.balance_php ?? 0) > 0 && !r.balance_paid_at
      ? Number(r.balance_php)
      : 0;

  return (
    <Shell>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-phosphor">{"// playcation_booking"}</p>
      <h1 className="mt-3 font-sans text-4xl font-bold text-cream">{branch?.name ?? "Comffee Playcation"}</h1>
      <p className={`mt-3 font-mono text-sm font-bold ${confirmed ? "text-phosphor" : "text-amber"}`}>
        {confirmed ? "▶ CONFIRMED" : r.status === "pending_hold" ? "◔ HOLD ACTIVE" : `· ${r.status}`}
      </p>

      <div className="mt-8 divide-y divide-line rounded-2xl border border-line-bright bg-bg-card">
        <Row label="Guest" value={r.guest_name ?? "—"} />
        <Row label="Check-in" value={formatDate(r.check_in)} />
        <Row label="Check-out" value={formatDate(r.check_out)} />
        <Row label="Guests" value={String(r.num_guests ?? 1)} />
        <Row label="Reservation fee paid" value={formatPHP(Number(r.total_php ?? 0))} highlight />
        {balanceDue > 0 && (
          <Row label={`Balance due${r.balance_due_date ? ` (${formatDate(r.balance_due_date)})` : ""}`} value={formatPHP(balanceDue)} />
        )}
        {Number(r.security_deposit_php ?? 0) > 0 && (
          <Row label="Security deposit" value={formatPHP(Number(r.security_deposit_php))} />
        )}
      </div>

      {balanceDue > 0 && (
        <p className="mt-6 text-cream-dim">
          Your dates are locked. Settle the remaining balance anytime from{" "}
          <Link href="/account" className="text-amber underline">your account</Link>
          {r.balance_due_date ? ` by ${formatDate(r.balance_due_date)}.` : "."}
        </p>
      )}

      <p className="mt-8 font-mono text-[0.65rem] text-mocha break-all">{"// id: "}{r.id}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/account" className="rounded-lg bg-amber px-6 py-3 font-bold text-bg">Manage booking</Link>
        <a href="https://www.comffee.org" className="rounded-lg border border-line-bright px-6 py-3 font-mono text-sm uppercase tracking-widest text-cream-dim hover:text-amber">
          Message us
        </a>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-cream">
      <div className="container-edge mx-auto max-w-2xl px-6 py-16">
        <div className="mb-10 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-mocha">
          COMFFEE<span className="text-amber">●</span> drink and play
        </div>
        {children}
      </div>
    </main>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">{label}</span>
      <span className={`text-right ${highlight ? "text-xl font-bold text-amber" : "text-cream"}`}>{value}</span>
    </div>
  );
}
