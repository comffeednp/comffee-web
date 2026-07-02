import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPaymentLink, isPaymongoConfigured } from "@/lib/paymongo";
import { confirmAndNotifyReservation } from "@/lib/booking-confirm";
import { settleFloorplanPendings } from "@/lib/floorplan-settle";

export const runtime = "nodejs";

/**
 * Releases pending_hold reservations whose hold_expires_at has passed.
 * Hit by GitHub Actions every 5 minutes.
 *
 * Reconciliation safety net: a webhook is NOT the only thing that can confirm a
 * payment. Webhooks get lost (network blips, signature mismatches, provider
 * delays), and trusting the expiry timer alone once silently auto-cancelled a
 * fully-paid booking. So before cancelling any expired hold that carries a
 * PayMongo link, we ask PayMongo directly whether it was paid:
 *   - paid            → confirm + notify (rescue it), exactly like the webhook would have.
 *   - not paid        → cancel as normal.
 *   - couldn't verify → leave it untouched and retry next run. We NEVER cancel a
 *                       hold we failed to verify, so a transient PayMongo outage
 *                       can't drop a paid booking.
 */
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

async function handleSweep() {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from("reservations")
    .select(
      "id, branch_id, member_id, guest_email, guest_name, guest_phone, check_in, check_out, num_guests, total_php, paymongo_intent_id",
    )
    .eq("status", "pending_hold")
    .lt("hold_expires_at", nowIso);
  if (error) return { ok: false, error: error.message };

  let released = 0;
  let rescued = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of expired ?? []) {
    // Reconcile paid-but-webhook-missed holds before cancelling.
    if (r.paymongo_intent_id && isPaymongoConfigured()) {
      try {
        const link = (await getPaymentLink(r.paymongo_intent_id)) as PaymongoLinkResponse;
        const { paid, paymentId } = linkPayment(link);
        if (paid) {
          await confirmAndNotifyReservation(r, paymentId);
          rescued++;
          continue;
        }
      } catch (e) {
        // Couldn't reach PayMongo — do NOT cancel; retry on the next 5-min run.
        errors.push(`verify ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
        continue;
      }
    }

    const { error: cancelErr } = await supabase
      .from("reservations")
      .update({ status: "cancelled", notes: "auto-released: hold expired" })
      .eq("id", r.id);
    if (cancelErr) {
      errors.push(`cancel ${r.id}: ${cancelErr.message}`);
      continue;
    }
    released++;
  }

  // PS5/table floor-plan reservations ride the same sweep: per-branch PayMongo accounts have no
  // webhook into us, so this is the safety net that confirms a PAID booking whose customer never
  // came back to the branch page (and expires stale unpaid holds). staleOnly=false so a paid
  // booking is rescued within ~10 min, not 20.
  let floorplan: { checked: number; confirmed: number; expired: number } | undefined;
  try {
    floorplan = await settleFloorplanPendings({ staleOnly: false });
  } catch (e) {
    errors.push(`floorplan sweep: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { ok: true, released, rescued, skipped, floorplan, errors: errors.length ? errors : undefined };
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret");
  return provided === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await handleSweep());
}

export async function POST(request: Request) {
  return GET(request);
}
