import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { addDays } from "@/lib/dates";
import { sendBalanceReminder, sendBalancePaidReceipt, sendCancellationEmail } from "@/lib/email";
import { getPaymentLink, isPaymongoConfigured } from "@/lib/paymongo";
import { markBalancePaid } from "@/lib/reservations";

export const runtime = "nodejs";

/**
 * Daily sweep for partial-payment bookings whose 70% balance is still unpaid:
 *   - Balance due within the next 2 days  → email a "balance due soon" reminder (once).
 *   - Balance due date already passed      → cancel the booking, release the dates,
 *                                             and email the guest (the 30% is forfeited).
 *
 * Reconciliation safety net (mirrors release-expired-holds): a lost balance
 * webhook must NOT let us cancel a booking the guest actually paid for. Before
 * cancelling an overdue booking we ask PayMongo whether its balance link was
 * paid — if so we settle it instead of cancelling; if we can't verify, we leave
 * it for the next run rather than risk cancelling a paid stay.
 *
 * Scheduled daily via vercel.json. Auth: CRON_SECRET (shared checkCronAuth).
 */

const REMIND_DAYS_AHEAD = 2;

interface PaymongoLinkResponse {
  data?: {
    attributes?: {
      status?: string;
      payments?: Array<{ data?: { id?: string; attributes?: { status?: string } } }>;
    };
  };
}

function linkPayment(link: PaymongoLinkResponse): { paid: boolean; paymentId: string | null } {
  const attrs = link?.data?.attributes ?? {};
  const paidPayment = (attrs.payments ?? []).find((p) => p?.data?.attributes?.status === "paid");
  return { paid: attrs.status === "paid" || !!paidPayment, paymentId: paidPayment?.data?.id ?? null };
}

function phToday(): string {
  // PH is UTC+8; the server runs UTC.
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function run() {
  const supabase = getSupabaseAdmin();
  const today = phToday();
  const remindThrough = addDays(today, REMIND_DAYS_AHEAD);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";

  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, branch_id, guest_name, guest_email, check_in, check_out, total_php, balance_php, balance_due_date, balance_reminder_sent_at, balance_paymongo_intent_id, branches(name, slug)",
    )
    .eq("status", "confirmed")
    .eq("payment_type", "partial")
    .is("balance_paid_at", null)
    .gt("balance_php", 0);
  if (error) return { ok: false, error: error.message };

  let reminded = 0;
  let cancelled = 0;
  let settled = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of data ?? []) {
    const due = r.balance_due_date as string | null;
    if (!due) continue;

    const branchRow = r.branches as { name?: string; slug?: string } | Array<{ name?: string; slug?: string }> | null;
    const branch = Array.isArray(branchRow) ? branchRow[0] : branchRow;
    const branchName = branch?.name ?? "Comffee Playcation";
    const guestEmail = r.guest_email as string | null;
    const guestName = (r.guest_name as string | null) ?? "Guest";

    if (due < today) {
      // Before cancelling: reconcile against PayMongo in case the balance was
      // paid but its webhook never landed. A lost webhook must not forfeit a
      // paid stay.
      const balanceIntent = r.balance_paymongo_intent_id as string | null;
      if (balanceIntent && isPaymongoConfigured()) {
        try {
          const link = (await getPaymentLink(balanceIntent)) as PaymongoLinkResponse;
          const { paid, paymentId } = linkPayment(link);
          if (paid) {
            await markBalancePaid(r.id, paymentId ?? undefined);
            if (branch?.slug) revalidatePath(`/branches/${branch.slug}`);
            if (guestEmail) {
              await sendBalancePaidReceipt({
                to: guestEmail,
                guestName,
                branchName,
                checkIn: r.check_in as string,
                checkOut: r.check_out as string,
                balancePhp: Number(r.balance_php ?? 0),
                reservationId: r.id as string,
              }).catch((e) => errors.push(`settle-email ${r.id}: ${e instanceof Error ? e.message : e}`));
            }
            settled++;
            continue;
          }
        } catch (e) {
          // Couldn't verify with PayMongo — do NOT cancel a possibly-paid stay.
          errors.push(`verify ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
          skipped++;
          continue;
        }
      }

      // Overdue and confirmed unpaid → cancel and release the dates.
      const { error: cancelErr } = await supabase
        .from("reservations")
        .update({ status: "cancelled", notes: "auto-cancelled: balance unpaid past due date" })
        .eq("id", r.id);
      if (cancelErr) {
        errors.push(`cancel ${r.id}: ${cancelErr.message}`);
        continue;
      }
      if (branch?.slug) revalidatePath(`/branches/${branch.slug}`);
      if (guestEmail) {
        await sendCancellationEmail({
          guestEmail,
          guestName,
          branchName,
          checkIn: r.check_in as string,
          checkOut: r.check_out as string,
          totalPhp: Number(r.total_php ?? 0),
          refundIssued: false,
          amountForfeitedPhp: Number(r.total_php ?? 0),
          reservationId: r.id as string,
          chatUrl: `${siteUrl}/account`,
        }).catch((e) => errors.push(`cancel-email ${r.id}: ${e instanceof Error ? e.message : e}`));
      }
      cancelled++;
    } else if (due <= remindThrough && !r.balance_reminder_sent_at && guestEmail) {
      const result = await sendBalanceReminder({
        to: guestEmail,
        guestName,
        branchName,
        checkIn: r.check_in as string,
        checkOut: r.check_out as string,
        balancePhp: Number(r.balance_php ?? 0),
        balanceDueDate: due,
        reservationId: r.id as string,
      });
      if (result.ok) {
        await supabase
          .from("reservations")
          .update({ balance_reminder_sent_at: new Date().toISOString() })
          .eq("id", r.id);
        reminded++;
      } else {
        errors.push(`remind ${r.id}: ${result.error}`);
      }
    }
  }

  return {
    ok: true,
    today,
    checked: (data ?? []).length,
    reminded,
    cancelled,
    settled,
    skipped,
    errors: errors.length ? errors : undefined,
  };
}

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });
  }
  return NextResponse.json(await run());
}

export async function POST(request: Request) {
  return GET(request);
}
