import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { classifyBalanceSweep } from "@/lib/booking-pricing";
import { sendBalanceReminder, sendCancellationEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Daily sweep for partial-payment bookings whose 70% balance is still unpaid:
 *   - Balance due within the next 2 days  → email a "balance due soon" reminder (once).
 *   - Balance due date already passed      → cancel the booking, release the dates,
 *                                             and email the guest (the 30% is forfeited).
 *
 * Scheduled daily via vercel.json. Auth: CRON_SECRET (shared checkCronAuth).
 */

const REMIND_DAYS_AHEAD = 2;

function phToday(): string {
  // PH is UTC+8; the server runs UTC.
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function run() {
  const supabase = getSupabaseAdmin();
  const today = phToday();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";

  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, branch_id, guest_name, guest_email, check_in, check_out, total_php, balance_php, balance_due_date, balance_reminder_sent_at, branches(name, slug)",
    )
    .eq("status", "confirmed")
    .eq("payment_type", "partial")
    .is("balance_paid_at", null)
    .gt("balance_php", 0);
  if (error) return { ok: false, error: error.message };

  let reminded = 0;
  let cancelled = 0;
  const errors: string[] = [];

  for (const r of data ?? []) {
    const due = r.balance_due_date as string | null;
    if (!due) continue;

    const branchRow = r.branches as { name?: string; slug?: string } | Array<{ name?: string; slug?: string }> | null;
    const branch = Array.isArray(branchRow) ? branchRow[0] : branchRow;
    const branchName = branch?.name ?? "Comffee Playcation";
    const guestEmail = r.guest_email as string | null;
    const guestName = (r.guest_name as string | null) ?? "Guest";

    const action = classifyBalanceSweep({
      balanceDueDate: due,
      today,
      remindDaysAhead: REMIND_DAYS_AHEAD,
      reminderAlreadySent: !!r.balance_reminder_sent_at,
    });

    if (action === "cancel") {
      // Overdue → cancel and release the dates.
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
    } else if (action === "remind" && guestEmail) {
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
