/**
 * Shared "a booking is now confirmed" notification path.
 *
 * Used by every route that confirms a paid booking — the PayMongo webhook (the
 * real-time path), the expired-hold sweep (reconciliation fallback when that
 * webhook never arrives), and the admin approve / resend actions. Keeping
 * confirm + payment-id + cache-bust + guest email + in-app chat in one place
 * guarantees the guest is told the same way no matter which path fired, so a
 * missed webhook that the sweep later rescues looks identical to a webhook that
 * landed.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { confirmReservation } from "@/lib/reservations";
import { sendBookingConfirmation } from "@/lib/email";
import { listInstructionPhotos } from "@/lib/branch-instructions";
import { formatRange } from "@/lib/dates";

export interface ConfirmableReservation {
  id: string;
  branch_id: string;
  member_id: string | null;
  guest_email: string | null;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  num_guests: number | null;
  total_php: number | string | null;
}

interface BranchRow {
  name?: string;
  slug?: string;
  address?: string | null;
  branch_rates?: Array<{ check_in_time: string | null; check_out_time: string | null; sort_order: number }>;
}

/**
 * Email the guest their branded booking confirmation (logo, dates, check-in
 * instructions). Self-contained so the admin "resend" action can reuse it.
 * Best-effort: never throws.
 */
export async function sendReservationConfirmationEmail(reservation: ConfirmableReservation): Promise<void> {
  if (!reservation.guest_email) return;
  const supabase = getSupabaseAdmin();
  const { data: branchData } = await supabase
    .from("branches")
    .select("name, slug, address, branch_rates (check_in_time, check_out_time, sort_order)")
    .eq("id", reservation.branch_id)
    .maybeSingle();
  const branch = branchData as BranchRow | null;
  const rates = (branch?.branch_rates ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const rateWithTime = rates.find((r) => r.check_in_time);
  await sendBookingConfirmation({
    to: reservation.guest_email,
    guestName: reservation.guest_name ?? "there",
    branchName: branch?.name ?? "Comffee Playcation",
    branchSlug: branch?.slug ?? "",
    branchAddress: branch?.address ?? null,
    checkIn: reservation.check_in,
    checkOut: reservation.check_out,
    checkInTime: rateWithTime?.check_in_time ?? null,
    checkOutTime: rateWithTime?.check_out_time ?? null,
    numGuests: reservation.num_guests ?? 1,
    totalPhp: Number(reservation.total_php ?? 0),
    reservationId: reservation.id,
    instructionPhotos: (await listInstructionPhotos(reservation.branch_id)).map((p) => ({
      label: p.label,
      url: p.signedUrl,
    })),
  }).catch((e) => console.error("[email] booking confirmation failed", e));
}

/**
 * Post a "your booking is confirmed" message into the guest's in-app chat
 * thread (keyed by member_id, like notifyOwnerOfBookingRequest). Idempotent —
 * skips if a confirmation message already exists in the thread, so it never
 * doubles up with the client-side /api/chat/booking-confirmed nudge. Best-effort.
 */
export async function postBookingConfirmedChat(reservation: ConfirmableReservation): Promise<void> {
  if (!reservation.member_id) return;
  try {
    const supabase = getSupabaseAdmin();
    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("member_id", reservation.member_id)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) return; // guest has no chat thread yet — nothing to post into

    // Idempotency: don't post a second confirmation for the same booking.
    const { data: existing } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("sender_type", "system")
      .ilike("body", "%booking confirmed%")
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const body = `✓ Booking confirmed! ${formatRange(reservation.check_in, reservation.check_out)} — we can't wait to host you. Message us here anytime.`;
    await supabase.from("chat_messages").insert({
      conversation_id: conv.id,
      sender_type: "system",
      body,
    });
    await supabase
      .from("chat_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_body: body,
        last_message_sender_type: "system",
        status: "open",
      })
      .eq("id", conv.id);
  } catch (e) {
    console.error("[chat] booking-confirmed post failed", e);
  }
}

/**
 * Confirm a held/approved reservation, attach its PayMongo payment id, bust the
 * branch availability cache, then notify the guest by email + in-app chat.
 */
export async function confirmAndNotifyReservation(
  reservation: ConfirmableReservation,
  actualPaymentId?: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await confirmReservation(reservation.id);
  if (actualPaymentId) {
    await supabase
      .from("reservations")
      .update({ paymongo_payment_id: actualPaymentId })
      .eq("id", reservation.id);
  }

  // Purge the branch page cache so the availability calendar updates immediately.
  const { data: b } = await supabase
    .from("branches")
    .select("slug")
    .eq("id", reservation.branch_id)
    .maybeSingle();
  const slug = (b as { slug?: string } | null)?.slug;
  if (slug) revalidatePath(`/branches/${slug}`);

  await sendReservationConfirmationEmail(reservation);
  await postBookingConfirmedChat(reservation);
}
