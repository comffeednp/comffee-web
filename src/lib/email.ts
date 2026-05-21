/**
 * Tiny Resend client + branded HTML email templates.
 *
 * - No SDK dep — direct REST call to Resend API
 * - No-op fallback when RESEND_API_KEY is unset (logs warning)
 * - All templates inline-style for email client compatibility
 * - Light theme (most email clients render dark backgrounds badly)
 *
 * Sender format: "Comffee Drink and Play <hello@yourdomain.com>"
 * Set RESEND_FROM env var to override the default.
 */

import { formatPHP } from "@/lib/utils";
import { formatRange } from "@/lib/dates";

const API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Comffee Drink and Play <onboarding@resend.dev>";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!isEmailConfigured()) {
    console.warn(
      `[email] RESEND_API_KEY not set — would have sent: ${input.subject} → ${input.to}`,
    );
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? DEFAULT_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend ${res.status}: ${body}`);
      return { ok: false, error: `resend_${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[email] send failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "network_error" };
  }
}

/* ---------------- shared template chrome ---------------- */

interface ChromeOptions {
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
}

function chrome({ preheader, bodyHtml, ctaLabel, ctaHref }: ChromeOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Comffee Drink and Play</title>
</head>
<body style="margin:0;padding:0;background:#f4ecdf;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a0f06;">
  <span style="display:none;font-size:0;line-height:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4ecdf;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e8dcc4;box-shadow:0 8px 24px rgba(26,15,6,0.06);overflow:hidden;">
          <tr>
            <td style="padding:24px 32px 0;">
              <div style="font-family:'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7a68;">
                COMFFEE<span style="color:#ff8a3d;">●</span> internet cafes and gaming staycations
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px;">
              ${bodyHtml}
              ${
                ctaLabel && ctaHref
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
                    <tr><td style="background:#ff8a3d;border-radius:10px;">
                      <a href="${escapeAttr(ctaHref)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.5px;">
                        ${escapeHtml(ctaLabel)}
                      </a>
                    </td></tr>
                  </table>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#faf6ee;border-top:1px solid #e8dcc4;font-family:'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a7a68;">
              // Comffee Drink and Play · this is a transactional email
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function receiptRow(label: string, value: string, highlight = false): string {
  return `<tr>
    <td style="padding:8px 0;color:#8a7a68;font-size:13px;${highlight ? "font-weight:600;" : ""}">${escapeHtml(label)}</td>
    <td style="padding:8px 0;color:${highlight ? "#ff8a3d" : "#1a0f06"};font-size:${highlight ? "18px" : "14px"};font-weight:${highlight ? "700" : "500"};text-align:right;">${escapeHtml(value)}</td>
  </tr>`;
}

/* ---------------- booking confirmation ---------------- */

interface BookingEmailInput {
  to: string;
  guestName: string;
  branchName: string;
  branchSlug: string;
  branchAddress?: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  numGuests: number;
  totalPhp: number;
  reservationId: string;
}

export async function sendBookingConfirmation(input: BookingEmailInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lookupUrl = `${siteUrl}/lookup?id=${input.reservationId}`;
  const checkInDate = new Date(input.checkIn + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const checkOutDate = new Date(input.checkOut + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const body = `
    <h1 style="margin:16px 0 8px;font-size:32px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Booking confirmed.
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(input.guestName.split(" ")[0])} — your stay at <strong>${escapeHtml(input.branchName)}</strong> is all set. We&rsquo;ll have the controllers charged and the espresso ready.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", input.branchName)}
      ${input.branchAddress ? receiptRow("Address", input.branchAddress) : ""}
      ${receiptRow("Check-in date", checkInDate)}
      ${input.checkInTime ? receiptRow("Check-in time", input.checkInTime) : ""}
      ${receiptRow("Check-out date", checkOutDate)}
      ${input.checkOutTime ? receiptRow("Check-out time", input.checkOutTime) : ""}
      ${receiptRow("Guests", String(input.numGuests))}
      ${receiptRow("Total paid", formatPHP(input.totalPhp), true)}
    </table>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // check-in instructions
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#5a4a3c;font-size:14px;line-height:1.8;">
      <li>Present a valid government-issued photo ID upon arrival.</li>
      <li>The name on the ID must match the reservation name.</li>
      <li>Only the number of guests declared at booking are allowed inside.</li>
      ${input.checkInTime ? `<li>Earliest check-in is <strong>${escapeHtml(input.checkInTime)}</strong>. Early check-in is subject to availability — message us to ask.</li>` : ""}
      <li>WiFi access details will be sent in a separate email on the day of your check-in.</li>
    </ul>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // checkout instructions
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#5a4a3c;font-size:14px;line-height:1.8;">
      ${input.checkOutTime ? `<li>Check-out is by <strong>${escapeHtml(input.checkOutTime)}</strong>. Late check-out beyond 12:00 PM may incur an additional night's charge.</li>` : "<li>Check-out is by 11:00 AM. Late check-out beyond 12:00 PM may incur an additional night's charge.</li>"}
      <li>Leave the unit in the same condition as you found it — surfaces clean, trash in bins, gaming gear back in place.</li>
      <li>Log out of any personal accounts on the PCs and consoles before leaving.</li>
      <li>Lock the door and return the key/access card to staff before departing.</li>
      <li>Your ₱1,000 security deposit will be returned within 24–48 hours after a satisfactory checkout inspection.</li>
    </ul>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // reservation_id
    </p>
    <p style="margin:0 0 16px;color:#1a0f06;font-size:13px;font-family:'JetBrains Mono',monospace;word-break:break-all;">
      ${escapeHtml(input.reservationId)}
    </p>

    <p style="margin:0;color:#5a4a3c;font-size:14px;line-height:1.6;">
      Reply to this email if you have any questions. See you soon!
    </p>
  `;

  return sendEmail({
    to: input.to,
    subject: `Booking confirmed · ${input.branchName} · ${formatRange(input.checkIn, input.checkOut)}`,
    html: chrome({
      preheader: `Booking confirmed — ${formatRange(input.checkIn, input.checkOut)} at ${input.branchName}${input.checkInTime ? ` · Check-in at ${input.checkInTime}` : ""}`,
      bodyHtml: body,
      ctaLabel: "View reservation",
      ctaHref: lookupUrl,
    }),
    text: `Booking confirmed at ${input.branchName} for ${formatRange(input.checkIn, input.checkOut)}. ${input.checkInTime ? `Check-in: ${input.checkInTime}.` : ""} ${input.checkOutTime ? `Check-out by: ${input.checkOutTime}.` : ""} ${input.branchAddress ?? ""} Total: ${formatPHP(input.totalPhp)}. Reservation ID: ${input.reservationId}. View: ${lookupUrl}`,
  });
}

/* ---------------- arrival reminders ---------------- */

interface ArrivalReminderInput {
  to: string;
  guestName: string;
  branchName: string;
  branchAddress: string | null;
  checkIn: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  reservationId: string;
}

export async function sendDayOfArrivalReminder(input: ArrivalReminderInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lookupUrl = `${siteUrl}/lookup?id=${input.reservationId}`;
  const timeInfo = input.checkInTime
    ? `<strong>Check-in:</strong> ${input.checkInTime}${input.checkOutTime ? ` &nbsp;·&nbsp; <strong>Check-out:</strong> ${input.checkOutTime}` : ""}`
    : "";

  const body = `
    <h1 style="margin:16px 0 8px;font-size:32px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Today's the day!
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(input.guestName.split(" ")[0])} — your Comffee Playcation stay at <strong>${escapeHtml(input.branchName)}</strong> is today. We&rsquo;re looking forward to having you!
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", input.branchName)}
      ${receiptRow("Check-in date", new Date(input.checkIn + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))}
      ${input.checkInTime ? receiptRow("Check-in time", input.checkInTime) : ""}
      ${input.checkOutTime ? receiptRow("Check-out time", input.checkOutTime) : ""}
      ${input.branchAddress ? receiptRow("Address", input.branchAddress) : ""}
    </table>

    ${timeInfo ? `<p style="margin:0 0 8px;color:#5a4a3c;font-size:14px;line-height:1.6;">${timeInfo}</p>` : ""}

    <p style="margin:16px 0 0;color:#5a4a3c;font-size:14px;line-height:1.6;">
      Reply to this email if you have any last-minute questions. See you soon!
    </p>
  `;

  return sendEmail({
    to: input.to,
    subject: `Today is your Comffee Playcation day! · ${input.branchName}`,
    html: chrome({
      preheader: `Your stay at ${input.branchName} is today${input.checkInTime ? ` — check-in at ${input.checkInTime}` : ""}`,
      bodyHtml: body,
      ctaLabel: "View reservation",
      ctaHref: lookupUrl,
    }),
    text: `Your Comffee Playcation at ${input.branchName} is today! ${input.checkInTime ? `Check-in: ${input.checkInTime}.` : ""} ${input.branchAddress ?? ""} Reservation: ${lookupUrl}`,
  });
}

export async function sendPreArrivalReminder(input: ArrivalReminderInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lookupUrl = `${siteUrl}/lookup?id=${input.reservationId}`;

  const body = `
    <h1 style="margin:16px 0 8px;font-size:32px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      2 hours to go!
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(input.guestName.split(" ")[0])} — your check-in at <strong>${escapeHtml(input.branchName)}</strong> is in about 2 hours. Head over when you&rsquo;re ready!
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", input.branchName)}
      ${input.checkInTime ? receiptRow("Check-in time", input.checkInTime, true) : ""}
      ${input.checkOutTime ? receiptRow("Check-out time", input.checkOutTime) : ""}
      ${input.branchAddress ? receiptRow("Address", input.branchAddress) : ""}
    </table>

    <p style="margin:16px 0 0;color:#5a4a3c;font-size:14px;line-height:1.6;">
      Reply to this email if you need directions or have any questions. Can&rsquo;t wait to see you!
    </p>
  `;

  return sendEmail({
    to: input.to,
    subject: `2 hours until your Comffee check-in · ${input.branchName}`,
    html: chrome({
      preheader: `Check-in at ${input.branchName}${input.checkInTime ? ` is at ${input.checkInTime}` : " is in 2 hours"}`,
      bodyHtml: body,
      ctaLabel: "View reservation",
      ctaHref: lookupUrl,
    }),
    text: `Your Comffee Playcation check-in at ${input.branchName} is in 2 hours${input.checkInTime ? ` (${input.checkInTime})` : ""}. ${input.branchAddress ?? ""} Reservation: ${lookupUrl}`,
  });
}

/* ---------------- order confirmation ---------------- */

interface OrderEmailInput {
  to: string;
  customerName: string;
  branchName: string;
  totalPhp: number;
  scheduledFor: string | null;
  orderId: string;
  items: Array<{ name: string; qty: number; lineTotalPhp: number }>;
}

export async function sendOrderConfirmation(input: OrderEmailInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lookupUrl = `${siteUrl}/lookup?id=${input.orderId}`;

  const itemsHtml = input.items
    .map(
      (it) =>
        `<tr>
          <td style="padding:6px 0;color:#1a0f06;font-size:14px;">× ${it.qty} ${escapeHtml(it.name)}</td>
          <td style="padding:6px 0;color:#5a4a3c;font-size:13px;text-align:right;">${escapeHtml(formatPHP(it.lineTotalPhp))}</td>
        </tr>`,
    )
    .join("");

  const pickupTime = input.scheduledFor
    ? new Date(input.scheduledFor).toLocaleString("en-PH", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "ASAP";

  const body = `
    <h1 style="margin:16px 0 8px;font-size:32px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Order placed.
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(input.customerName.split(" ")[0])} — we&rsquo;re firing up the espresso machine. Show this email at pickup or use the lookup link.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Pickup", input.branchName)}
      ${receiptRow("Ready by", pickupTime)}
    </table>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // line items
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e8dcc4;">
      ${itemsHtml}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-top:2px solid #ff8a3d;padding-top:12px;">
      ${receiptRow("Total", formatPHP(input.totalPhp), true)}
    </table>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // order_id
    </p>
    <p style="margin:0;color:#1a0f06;font-size:13px;font-family:'JetBrains Mono',monospace;word-break:break-all;">
      ${escapeHtml(input.orderId)}
    </p>
  `;

  return sendEmail({
    to: input.to,
    subject: `Your Comffee order is in · ${input.branchName}`,
    html: chrome({
      preheader: `Order placed — ${input.items.length} items, total ${formatPHP(input.totalPhp)}`,
      bodyHtml: body,
      ctaLabel: "View order",
      ctaHref: lookupUrl,
    }),
    text: `Order at ${input.branchName} for ${formatPHP(input.totalPhp)}. Pickup ${pickupTime}. Order ID: ${input.orderId}. View: ${lookupUrl}`,
  });
}

/* ---------------- new chat inquiry notification ---------------- */

export async function sendNewChatInquiry({
  customerName,
  branchName,
  checkIn,
  checkOut,
  adminChatUrl,
}: {
  customerName?: string | null;
  branchName?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  adminChatUrl: string;
}) {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) return;

  const who = customerName ?? "Anonymous";
  const context = [
    branchName ? `Branch: ${branchName}` : null,
    checkIn && checkOut ? `Dates: ${checkIn} – ${checkOut}` : null,
  ].filter(Boolean).join(" · ");

  const body = `
    <h1 style="margin:16px 0 8px;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      New chat inquiry
    </h1>
    <p style="margin:0 0 16px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(who)}</strong> just started a chat${context ? ` — ${escapeHtml(context)}` : ""}.
    </p>
    <p style="margin:0;color:#8a7a68;font-size:13px;">Reply quickly to convert the inquiry into a booking.</p>
  `;

  return sendEmail({
    to,
    subject: `New chat from ${who}${branchName ? ` · ${branchName}` : ""}`,
    html: chrome({
      preheader: `${who} is asking${branchName ? ` about ${branchName}` : ""}${checkIn ? ` · ${checkIn}` : ""}`,
      bodyHtml: body,
      ctaLabel: "Open inbox",
      ctaHref: adminChatUrl,
    }),
    text: `New chat from ${who}. ${context} Open: ${adminChatUrl}`,
  });
}

/* ---------------- booking cancellation ---------------- */

export async function sendCancellationEmail({
  guestEmail,
  guestName,
  branchName,
  checkIn,
  checkOut,
  totalPhp,
  refundIssued,
  reservationId,
  chatUrl,
}: {
  guestEmail: string;
  guestName: string;
  branchName: string;
  checkIn: string;
  checkOut: string;
  totalPhp: number;
  refundIssued: boolean;
  reservationId: string;
  chatUrl: string;
}) {
  const checkInDate = new Date(checkIn + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const checkOutDate = new Date(checkOut + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const refundNote = refundIssued
    ? `<p style="margin:0 0 16px;color:#5a4a3c;font-size:14px;line-height:1.6;">
        A refund of <strong>${formatPHP(totalPhp)}</strong> has been initiated and will be returned to your original payment method within 5–10 business days, depending on your bank.
      </p>
      <p style="margin:0 0 16px;color:#8a7a68;font-size:13px;line-height:1.6;">
        <strong>Paid via QR Ph / GCash?</strong> Automatic API refunds are not available for QR Ph payments.
        Please message us in chat with your GCash number or bank account details so we can process the manual transfer.
        <a href="${escapeHtml(chatUrl)}" style="color:#c98a2a;">Open chat →</a>
      </p>`
    : `<p style="margin:0 0 16px;color:#5a4a3c;font-size:14px;line-height:1.6;">
        No charge was collected for this booking, so no refund is required.
      </p>`;

  const body = `
    <h1 style="margin:16px 0 8px;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Booking cancelled.
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(guestName.split(" ")[0])} — your reservation at <strong>${escapeHtml(branchName)}</strong> has been cancelled. We&rsquo;re sorry for the inconvenience.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", branchName)}
      ${receiptRow("Check-in", checkInDate)}
      ${receiptRow("Check-out", checkOutDate)}
      ${totalPhp > 0 ? receiptRow("Amount paid", formatPHP(totalPhp), true) : ""}
    </table>

    ${refundNote}

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // reservation_id
    </p>
    <p style="margin:0;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;">
      ${escapeHtml(reservationId)}
    </p>
  `;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  return sendEmail({
    to: guestEmail,
    subject: `Booking cancelled — ${branchName} · ${formatRange(checkIn, checkOut)}`,
    html: chrome({
      preheader: `Your reservation at ${branchName} has been cancelled.`,
      bodyHtml: body,
      ctaLabel: "Chat with us",
      ctaHref: chatUrl,
    }),
    text: `Your booking at ${branchName} (${checkIn} – ${checkOut}) has been cancelled. Reservation ID: ${reservationId}. ${refundIssued ? `A refund of ${formatPHP(totalPhp)} has been initiated.` : ""} Chat: ${siteUrl}`,
    replyTo: `bookings@comffee.org`,
  });
}
