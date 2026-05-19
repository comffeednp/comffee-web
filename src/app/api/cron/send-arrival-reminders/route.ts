import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendDayOfArrivalReminder, sendPreArrivalReminder } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Sends two kinds of arrival reminder emails:
 *  1. Day-of reminder  — fires between 08:00–09:00 PH time
 *  2. Pre-arrival (2h) — fires every hour; sends to guests whose check-in time is ~2h away
 *
 * Scheduled: every hour via vercel.json cron (0 * * * *)
 * Auth: CRON_SECRET bearer token (same pattern as release-expired-holds)
 */

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret");
  return provided === secret;
}

function phNow() {
  const now = new Date();
  // PH is UTC+8
  const phMs = now.getTime() + 8 * 60 * 60 * 1000;
  const ph = new Date(phMs);
  return {
    hour: ph.getUTCHours(),
    minute: ph.getUTCMinutes(),
    totalMinutes: ph.getUTCHours() * 60 + ph.getUTCMinutes(),
    dateStr: ph.toISOString().slice(0, 10), // YYYY-MM-DD
  };
}

async function run() {
  const supabase = getSupabaseAdmin();
  const ph = phNow();

  const isDayOfWindow = ph.hour >= 11 && ph.hour < 12;

  // Fetch all confirmed reservations checking in today (PH date) that still need reminders
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select(`
      id,
      branch_id,
      guest_name,
      guest_email,
      check_in,
      arrival_email_sent,
      pre_arrival_email_sent,
      branches (
        name,
        address,
        branch_rates ( check_in_time, check_out_time, sort_order )
      )
    `)
    .eq("check_in", ph.dateStr)
    .eq("status", "confirmed")
    .not("guest_email", "is", null);

  if (error) return { ok: false, error: error.message };

  let dayOfSent = 0;
  let preArrivalSent = 0;
  const errors: string[] = [];

  for (const res of reservations ?? []) {
    const email = res.guest_email as string;
    const name = (res.guest_name as string | null) ?? "Guest";

    const branch = (res.branches as any);
    const branchName: string = branch?.name ?? "Comffee Playcation";
    const branchAddress: string | null = branch?.address ?? null;

    // Pick the first rate that has a check_in_time (sorted by sort_order)
    const rates: Array<{ check_in_time: string | null; check_out_time: string | null; sort_order: number }> =
      (branch?.branch_rates ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);
    const rateWithTime = rates.find((r) => r.check_in_time);
    const checkInTime = rateWithTime?.check_in_time ?? null;
    const checkOutTime = rateWithTime?.check_out_time ?? null;

    const input = {
      to: email,
      guestName: name,
      branchName,
      branchAddress,
      checkIn: res.check_in as string,
      checkInTime,
      checkOutTime,
      reservationId: res.id as string,
    };

    // 1. Day-of reminder (08:00–09:00 PH, send once)
    if (isDayOfWindow && !res.arrival_email_sent) {
      const result = await sendDayOfArrivalReminder(input);
      if (result.ok) {
        await supabase
          .from("reservations")
          .update({ arrival_email_sent: true })
          .eq("id", res.id);
        dayOfSent++;
      } else {
        errors.push(`day-of ${res.id}: ${result.error}`);
      }
    }

    // 2. Pre-arrival 2h reminder (send once when check_in_time is ~2h away)
    if (!res.pre_arrival_email_sent && checkInTime) {
      const [ciHour, ciMin] = checkInTime.split(":").map(Number);
      const checkInMinutes = ciHour * 60 + ciMin;
      const diff = checkInMinutes - ph.totalMinutes;
      // Window: 100–140 minutes (2h ± 20min, matches an hourly cron)
      if (diff >= 100 && diff <= 140) {
        const result = await sendPreArrivalReminder(input);
        if (result.ok) {
          await supabase
            .from("reservations")
            .update({ pre_arrival_email_sent: true })
            .eq("id", res.id);
          preArrivalSent++;
        } else {
          errors.push(`pre-arrival ${res.id}: ${result.error}`);
        }
      }
    }
  }

  return {
    ok: true,
    phTime: `${String(ph.hour).padStart(2, "0")}:${String(ph.minute).padStart(2, "0")}`,
    checked: (reservations ?? []).length,
    dayOfSent,
    preArrivalSent,
    errors: errors.length ? errors : undefined,
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run());
}

export async function POST(request: Request) {
  return GET(request);
}
