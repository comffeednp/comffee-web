/**
 * Owner alerts for a new request-to-book. Fires three of the four channels from
 * the backend — phone push, the chat thread, and email. (The fourth, the
 * Bookings list, is the admin page itself.)
 *
 * Every channel is best-effort and independently try/caught: a failure in one
 * (e.g. push not configured, no chat thread, owner email unset) must never block
 * the booking or the other channels.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToToken } from "@/lib/fcm";
import { sendBookingRequestToOwner } from "@/lib/email";
import { formatPHP } from "@/lib/utils";
import { formatRange } from "@/lib/dates";

export interface BookingRequestInfo {
  id: string;
  branchId: string;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  totalPhp: number;
  memberId: string | null;
}

export async function notifyOwnerOfBookingRequest(info: BookingRequestInfo) {
  const supabase = getSupabaseAdmin();
  const { data: branch } = await supabase
    .from("branches")
    .select("name")
    .eq("id", info.branchId)
    .maybeSingle();
  const branchName = (branch as { name?: string } | null)?.name ?? "Comffee Playcation";
  const dates = formatRange(info.checkIn, info.checkOut);
  const amount = formatPHP(info.totalPhp);
  const guest = info.guestName ?? "A guest";

  // 1) phone push to every admin device → one tap opens the booking to act
  try {
    const { data: devices } = await supabase.from("admin_devices").select("fcm_token");
    await Promise.allSettled(
      (devices ?? []).map((d) =>
        sendPushToToken(d.fcm_token as string, {
          title: "New booking request",
          body: `${guest} · ${branchName} · ${dates} · ${amount} — accept or decline`,
          url: `/admin/bookings/${info.id}`,
        }),
      ),
    );
  } catch (e) {
    console.error("[booking-notify] push failed", e);
  }

  // 2) chat thread — heads-up in the guest's conversation so it lights up the
  //    owner's inbox. Guest-safe wording (the guest can see this thread).
  try {
    if (info.memberId) {
      const { data: conv } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("member_id", info.memberId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conv) {
        await supabase.from("chat_messages").insert({
          conversation_id: conv.id,
          sender_type: "system",
          body: `📋 Booking request received — ${branchName}, ${dates} (${amount}). It's now waiting for the host to confirm.`,
        });
        await supabase
          .from("chat_conversations")
          .update({ last_message_at: new Date().toISOString(), status: "open" })
          .eq("id", conv.id);
      }
    }
  } catch (e) {
    console.error("[booking-notify] chat failed", e);
  }

  // 3) email to the owner (best-effort; only if OWNER_NOTIFICATION_EMAIL is set)
  try {
    await sendBookingRequestToOwner({
      branchName,
      guestName: guest,
      checkIn: info.checkIn,
      checkOut: info.checkOut,
      totalPhp: info.totalPhp,
      reservationId: info.id,
    });
  } catch (e) {
    console.error("[booking-notify] owner email failed", e);
  }
}
