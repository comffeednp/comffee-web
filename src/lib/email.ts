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
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; path: string }>;
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
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
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

/* ---------------- cash-move approval code ---------------- */

interface CashMoveCodeInput {
  to: string;
  type: "drop" | "pickup" | "expense";
  staffName: string;
  branchName: string;
  amount: number;
  reason: string;
  code: string;
}

// The website's version of the POS approval email: a worker entered a cash drop/pickup/expense on the
// clock-in page, and this emails the owner the 6-digit code to relay back to the worker (relaying the
// code IS the approval). Mirrors the POS sendApprovalEmail so it reads the same to the owner.
export async function sendCashMoveApprovalCode(input: CashMoveCodeInput) {
  const typeLabel = { drop: "CASH DROP", pickup: "CASH PICKUP", expense: "EXPENSE" }[input.type];
  const body = `
    <h1 style="margin:16px 0 8px;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Approval needed: ${escapeHtml(typeLabel)}
    </h1>
    <p style="margin:0 0 20px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(input.staffName)}</strong> is recording a cash move at <strong>${escapeHtml(input.branchName)}</strong>. Give them the code below to approve it — or ignore this email to deny it.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Type", typeLabel)}
      ${receiptRow("Amount", "PHP " + input.amount.toFixed(2), true)}
      ${receiptRow("Reason", input.reason)}
    </table>
    <div style="margin:24px 0 8px;text-align:center;">
      <div style="font-size:11px;color:#8a7a68;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Approval code</div>
      <div style="display:inline-block;background:#f0faf1;border:2px solid #2e7d32;border-radius:12px;padding:14px 28px;font-size:34px;font-weight:900;letter-spacing:8px;font-family:'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace;color:#2e7d32;">
        ${escapeHtml(input.code)}
      </div>
      <div style="font-size:12px;color:#c0392b;margin-top:10px;font-weight:600;">Do NOT share if you want to deny this.</div>
    </div>`;
  return sendEmail({
    to: input.to,
    subject: `[APPROVAL NEEDED] ${typeLabel} — ${input.staffName} — PHP ${input.amount.toFixed(2)}`,
    html: chrome({ preheader: `Approval code for ${typeLabel}`, bodyHtml: body }),
  });
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
  instructionPhotos?: Array<{ label: string; url: string }>;
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

  const photos = input.instructionPhotos ?? [];
  // Some branches (e.g. staffed houses) have no self check-in sheet — for those
  // we tell the guest the key details come via chat the day before.
  const hasCheckInSheet = photos.some((p) => /check[\s-]?in/i.test(p.label));
  const essentialsLead = hasCheckInSheet
    ? "self check-in &amp; check-out steps, the door PIN and where to find it, and answers to the most common questions"
    : "check-out steps, house rules, location, and answers to the most common questions";

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
      // house rules
    </p>
    <p style="margin:0 0 16px;color:#5a4a3c;font-size:14px;line-height:1.6;">
      A quick note on house rules — please keep noise, music, and smoking moderate, especially during quiet hours, so we stay on great terms with the neighbours and everyone enjoys their stay. Thank you so much for your cooperation!
    </p>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // your stay essentials
    </p>
    ${photos.length > 0
      ? `<p style="margin:0 0 12px;color:#5a4a3c;font-size:14px;line-height:1.6;">
          Your stay essentials are <strong>attached</strong> — ${essentialsLead}. Give them a quick read before you arrive. If anything's unclear, message us anytime through the <a href="${siteUrl}" style="color:#c98a2a;">chat on our website</a> — we're happy to help.
        </p>
        <ul style="margin:0 0 16px;padding-left:20px;color:#5a4a3c;font-size:14px;line-height:1.8;">
          ${photos.map((p) => `<li>${escapeHtml(p.label)}</li>`).join("")}
        </ul>
        ${!hasCheckInSheet
          ? `<p style="margin:0 0 16px;color:#5a4a3c;font-size:14px;line-height:1.6;">
              We'll <strong>message you the day before</strong> your stay with where to pick up your key.
            </p>`
          : ""}`
      : `<p style="margin:0 0 16px;color:#5a4a3c;font-size:14px;line-height:1.6;">
          We'll send your check-in details and door PIN closer to your stay. If you have any questions in the meantime, message us through the <a href="${siteUrl}" style="color:#c98a2a;">chat on our website</a> anytime.
        </p>`}

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // reservation_id
    </p>
    <p style="margin:0 0 16px;color:#1a0f06;font-size:13px;font-family:'JetBrains Mono',monospace;word-break:break-all;">
      ${escapeHtml(input.reservationId)}
    </p>

    <p style="margin:0;color:#5a4a3c;font-size:14px;line-height:1.6;">
      Have a question? Message us through the <a href="${siteUrl}" style="color:#c98a2a;">chat on our website</a> anytime. See you soon!
    </p>
  `;

  const attachments: Array<{ filename: string; path: string }> = (input.instructionPhotos ?? []).map((p, i) => ({
    filename: `${(p.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || `sheet-${i + 1}`)}.jpg`,
    path: p.url,
  }));

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
    ...(attachments.length ? { attachments } : {}),
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
  // ADMIN_NOTIFICATION_EMAIL may be a comma-separated list — alert all of them.
  const recipients = (process.env.ADMIN_NOTIFICATION_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) return;

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
    to: recipients,
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
  amountForfeitedPhp,
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
  amountForfeitedPhp?: number;
}) {
  const checkInDate = new Date(checkIn + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const checkOutDate = new Date(checkOut + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const refundNote = refundIssued
    ? `<p style="margin:0 0 16px;color:#5a4a3c;font-size:14px;line-height:1.6;">
        A refund of <strong>${formatPHP(totalPhp)}</strong> has been initiated by Comffee and will be returned to your original payment method within 10 calendar days.
      </p>
      <p style="margin:0 0 16px;color:#8a7a68;font-size:13px;line-height:1.6;">
        <strong>Paid via QR Ph / GCash?</strong> Automatic API refunds are not available for QR Ph payments.
        Comffee will manually issue the refund via GCash or InstaPay to the mobile number on your reservation within 10 calendar days.
        <a href="${escapeHtml(chatUrl)}" style="color:#c98a2a;">Message us if you have questions →</a>
      </p>`
    : amountForfeitedPhp && amountForfeitedPhp > 0
    ? `<p style="margin:0 0 16px;color:#5a4a3c;font-size:14px;line-height:1.6;">
        The remaining balance was not paid by the due date, so this reservation has been cancelled and the dates released.
        As stated in our terms, the <strong>${formatPHP(amountForfeitedPhp)}</strong> reservation fee already paid is non-refundable.
        <a href="${escapeHtml(chatUrl)}" style="color:#c98a2a;">Message us if you have questions →</a>
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

/* ---------------- request-to-book: request received (guest) ---------------- */

export async function sendBookingRequestReceived({
  to,
  guestName,
  branchName,
  checkIn,
  checkOut,
  totalPhp,
  reservationId,
}: {
  to: string;
  guestName: string;
  branchName: string;
  checkIn: string;
  checkOut: string;
  totalPhp: number;
  reservationId: string;
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  const checkInDate = new Date(checkIn + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const checkOutDate = new Date(checkOut + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const body = `
    <h1 style="margin:16px 0 8px;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Request received — pending host approval.
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(guestName.split(" ")[0])} — thanks! Your payment for <strong>${escapeHtml(branchName)}</strong> is in and your dates are held. The host reviews every booking before it&rsquo;s confirmed — you&rsquo;ll get a confirmation email the moment it&rsquo;s approved. If it can&rsquo;t be accepted, you&rsquo;ll be refunded in full.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", branchName)}
      ${receiptRow("Check-in", checkInDate)}
      ${receiptRow("Check-out", checkOutDate)}
      ${receiptRow("Amount paid", formatPHP(totalPhp), true)}
    </table>
    <p style="margin:0 0 16px;color:#8a7a68;font-size:13px;line-height:1.6;">
      Most hosts respond within a day. If there&rsquo;s no response in 24 hours, your request is automatically cancelled and refunded.
    </p>
    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">// reservation_id</p>
    <p style="margin:0;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;">${escapeHtml(reservationId)}</p>
  `;
  return sendEmail({
    to,
    subject: `Request received — ${branchName} · ${formatRange(checkIn, checkOut)} (pending approval)`,
    html: chrome({
      preheader: `Your ${branchName} request is in and awaiting host approval.`,
      bodyHtml: body,
      ctaLabel: "View your bookings",
      ctaHref: `${siteUrl}/account`,
    }),
    text: `Hi ${guestName.split(" ")[0]}, your payment for ${branchName} (${checkIn} - ${checkOut}) is in and your dates are held, pending host approval. You'll be confirmed once accepted, or refunded in full if not. Reservation ID: ${reservationId}.`,
    replyTo: `bookings@comffee.org`,
  });
}

/* ---------------- request-to-book: new request (owner) ---------------- */

export async function sendBookingRequestToOwner({
  branchName,
  guestName,
  checkIn,
  checkOut,
  totalPhp,
  reservationId,
}: {
  branchName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  totalPhp: number;
  reservationId: string;
}) {
  const to = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!to) return { ok: false, error: "owner_email_not_configured" };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  const body = `
    <h1 style="margin:16px 0 8px;font-size:26px;font-weight:800;color:#1a0f06;">New booking request — action needed.</h1>
    <p style="margin:0 0 20px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(guestName)}</strong> paid and is waiting for you to <strong>accept</strong> or <strong>decline</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", branchName)}
      ${receiptRow("Dates", formatRange(checkIn, checkOut))}
      ${receiptRow("Amount paid", formatPHP(totalPhp), true)}
    </table>
    <p style="margin:0 0 16px;color:#8a7a68;font-size:13px;line-height:1.6;">
      Declining auto-refunds the guest. No response within 24 hours auto-declines + refunds.
    </p>
  `;
  return sendEmail({
    to,
    subject: `Action needed — booking request: ${branchName} · ${formatRange(checkIn, checkOut)}`,
    html: chrome({
      preheader: `${guestName} is waiting for your accept/decline.`,
      bodyHtml: body,
      ctaLabel: "Review & decide",
      ctaHref: `${siteUrl}/admin/bookings/${reservationId}`,
    }),
    text: `New booking request: ${guestName} - ${branchName} (${checkIn} - ${checkOut}), ${formatPHP(totalPhp)}. Accept or decline: ${siteUrl}/admin/bookings/${reservationId}`,
  });
}

/* ---------------- partial-payment balance reminder ---------------- */

interface BalanceReminderInput {
  to: string;
  guestName: string;
  branchName: string;
  checkIn: string;
  checkOut: string;
  balancePhp: number;
  balanceDueDate: string; // YYYY-MM-DD
  reservationId: string;
}

export async function sendBalanceReminder(input: BalanceReminderInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // The guest pays the balance from their account page (signed-in, owns the booking).
  const payUrl = `${siteUrl}/account`;
  const dueDate = new Date(input.balanceDueDate + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const body = `
    <h1 style="margin:16px 0 8px;font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Your balance is due soon.
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(input.guestName.split(" ")[0])} — thanks for reserving <strong>${escapeHtml(input.branchName)}</strong>.
      The remaining balance for your stay is due by <strong>${escapeHtml(dueDate)}</strong>. Please settle it
      before then so we can keep your dates locked in.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", input.branchName)}
      ${receiptRow("Stay", formatRange(input.checkIn, input.checkOut))}
      ${receiptRow("Balance due by", dueDate)}
      ${receiptRow("Balance amount", formatPHP(input.balancePhp), true)}
    </table>

    <p style="margin:16px 0 0;color:#8a7a68;font-size:13px;line-height:1.6;">
      If the balance is not paid by the due date, the reservation may be cancelled and the dates released.
      The 30% reservation fee already paid is non-refundable.
    </p>
  `;

  return sendEmail({
    to: input.to,
    subject: `Balance due soon · ${input.branchName} · ${formatRange(input.checkIn, input.checkOut)}`,
    html: chrome({
      preheader: `Your remaining balance of ${formatPHP(input.balancePhp)} is due by ${dueDate}`,
      bodyHtml: body,
      ctaLabel: "Pay balance",
      ctaHref: payUrl,
    }),
    text: `Reminder: the remaining balance of ${formatPHP(input.balancePhp)} for your stay at ${input.branchName} (${formatRange(input.checkIn, input.checkOut)}) is due by ${dueDate}. Pay it from your account: ${payUrl}`,
    replyTo: `bookings@comffee.org`,
  });
}

/* ---------------- balance paid (receipt) ---------------- */

interface BalancePaidInput {
  to: string;
  guestName: string;
  branchName: string;
  checkIn: string;
  checkOut: string;
  balancePhp: number;
  reservationId: string;
}

export async function sendBalancePaidReceipt(input: BalancePaidInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lookupUrl = `${siteUrl}/lookup?id=${input.reservationId}`;

  const body = `
    <h1 style="margin:16px 0 8px;font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Balance paid — you're all set.
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(input.guestName.split(" ")[0])} — we received your balance payment for
      <strong>${escapeHtml(input.branchName)}</strong>. Your stay is now paid in full. See you soon!
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Branch", input.branchName)}
      ${receiptRow("Stay", formatRange(input.checkIn, input.checkOut))}
      ${receiptRow("Balance paid", formatPHP(input.balancePhp), true)}
    </table>
  `;

  return sendEmail({
    to: input.to,
    subject: `Balance paid · ${input.branchName} · ${formatRange(input.checkIn, input.checkOut)}`,
    html: chrome({
      preheader: `We received your balance payment of ${formatPHP(input.balancePhp)}`,
      bodyHtml: body,
      ctaLabel: "View reservation",
      ctaHref: lookupUrl,
    }),
    text: `We received your balance payment of ${formatPHP(input.balancePhp)} for ${input.branchName} (${formatRange(input.checkIn, input.checkOut)}). Your stay is paid in full. View: ${lookupUrl}`,
  });
}

/* ---------------- unanswered chat reminder (escalation) ---------------- */

export async function sendChatReminder({
  customerName,
  branchName,
  lastMessage,
  waitingLabel,
  adminChatUrl,
}: {
  customerName?: string | null;
  branchName?: string | null;
  lastMessage?: string | null;
  waitingLabel: string;
  adminChatUrl: string;
}) {
  const recipients = (process.env.ADMIN_NOTIFICATION_EMAIL ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) return;

  const who = customerName ?? "A guest";
  const body = `
    <h1 style="margin:16px 0 8px;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Unanswered chat — waiting ${escapeHtml(waitingLabel)}
    </h1>
    <p style="margin:0 0 16px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(who)}</strong>${branchName ? ` (${escapeHtml(branchName)})` : ""} is still waiting for a reply.
    </p>
    ${lastMessage ? `<p style="margin:0 0 16px;padding:12px 16px;background:#faf6ee;border:1px solid #e8dcc4;border-radius:10px;color:#1a0f06;font-size:14px;">&ldquo;${escapeHtml(lastMessage)}&rdquo;</p>` : ""}
    <p style="margin:0;color:#8a7a68;font-size:13px;line-height:1.6;">Open the inbox to reply — these reminders stop the moment you open the conversation.</p>
  `;
  return sendEmail({
    to: recipients,
    subject: `Unanswered chat from ${who} — waiting ${waitingLabel}`,
    html: chrome({
      preheader: `${who} is waiting for a reply (${waitingLabel})`,
      bodyHtml: body,
      ctaLabel: "Open inbox",
      ctaHref: adminChatUrl,
    }),
    text: `${who}${branchName ? ` (${branchName})` : ""} is waiting for a reply (${waitingLabel}). ${lastMessage ? `Last: "${lastMessage}". ` : ""}Open: ${adminChatUrl}`,
  });
}

/* ---------------- guest reply reminder (nudge the customer) ---------------- */

export async function sendCustomerReplyReminder({
  to,
  guestName,
  branchName,
  lastMessage,
  chatUrl,
}: {
  to: string;
  guestName?: string | null;
  branchName?: string | null;
  lastMessage?: string | null;
  chatUrl: string;
}) {
  const first = (guestName ?? "there").split(" ")[0];
  const body = `
    <h1 style="margin:16px 0 8px;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      You have a reply from Comffee
    </h1>
    <p style="margin:0 0 16px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(first)} — we replied to your chat${branchName ? ` about <strong>${escapeHtml(branchName)}</strong>` : ""} and haven't heard back yet. Whenever you're ready, just hop back into the chat to continue.
    </p>
    ${lastMessage ? `<p style="margin:0 0 16px;padding:12px 16px;background:#faf6ee;border:1px solid #e8dcc4;border-radius:10px;color:#1a0f06;font-size:14px;">&ldquo;${escapeHtml(lastMessage)}&rdquo;</p>` : ""}
  `;
  return sendEmail({
    to,
    subject: `You have a reply from Comffee${branchName ? ` · ${branchName}` : ""}`,
    html: chrome({
      preheader: "We replied to your chat — pick up where you left off",
      bodyHtml: body,
      ctaLabel: "Continue chat",
      ctaHref: chatUrl,
    }),
    text: `Hi ${first}, we replied to your Comffee chat and haven't heard back yet. Continue the chat: ${chatUrl}`,
    replyTo: `bookings@comffee.org`,
  });
}

/* ---------------- branch edit submitted (cafe owner pushed page changes from POS) ---------------- */

interface BranchEditSubmittedInput {
  to: string;             // owner inbox (johnjosephtopacio@gmail.com or APPROVAL_EMAIL_TO)
  branchName: string;     // e.g. "Lagro"
  submittedBy: string;    // license key / machine id from the POS — audit trail
  branchAdminUrl: string; // direct link to /admin/branches/<id> where the inline approve panel lives
  changeSummary: string[];// short bullets of what changed (e.g. ["Updated hours", "3 new photos"])
}

// Sent when a cafe owner presses "Send for approval" in the POS Reservation tab. Lands in the
// owner's inbox + the inline panel at /admin/branches/<id> shows the same submission with
// one-click Approve / Reject. [[comffee-saas-vision]] Stage 4.
export async function sendBranchEditSubmittedEmail(input: BranchEditSubmittedInput) {
  const { to, branchName, submittedBy, branchAdminUrl, changeSummary } = input;
  const summaryHtml = changeSummary.length
    ? `<ul style="margin:8px 0 16px;padding-left:20px;color:#5a4a3c;font-size:14px;line-height:1.7;">${changeSummary.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";
  const body = `
    <h1 style="margin:16px 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Page changes submitted — ${escapeHtml(branchName)}
    </h1>
    <p style="margin:0 0 8px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      A cafe has submitted updates to their public page on comffee.org.
    </p>
    ${summaryHtml}
    <p style="margin:8px 0 16px;color:#8a7a68;font-size:13px;line-height:1.6;">
      Submitted by <code style="background:#faf6ee;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(submittedBy)}</code>. Approve or reject inline on the branch admin page.
    </p>
  `;
  return sendEmail({
    to,
    subject: `📋 Page changes submitted — ${branchName}`,
    html: chrome({
      preheader: `${branchName} submitted page changes — review and approve`,
      bodyHtml: body,
      ctaLabel: "Review and approve",
      ctaHref: branchAdminUrl,
    }),
    text: `${branchName} submitted page changes. Review: ${branchAdminUrl}`,
    replyTo: `bookings@comffee.org`,
  });
}

/* ---------------- Partner-Cafe subscription: license key delivery ---------------- */

interface SubscriptionKeyInput {
  to: string;
  tierName: string; // e.g. "AI-Integrated"
  amountPhp: number;
  licenseKey: string;
}

// Sent to a Partner Cafe the moment their PayMongo subscription payment is confirmed and a license
// key is minted. The POS auto-fills the key on the device they paid from, but we email it for
// safekeeping / reinstalls. [[comffee-saas-vision]]
export async function sendSubscriptionKey(input: SubscriptionKeyInput) {
  const body = `
    <h1 style="margin:16px 0 8px;font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Welcome to Comffee POS!
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Your payment is in and your <strong>${escapeHtml(input.tierName)}</strong> subscription is active. Here&rsquo;s your license key — keep it somewhere safe. You&rsquo;ll need it to re-activate Comffee POS if you ever reinstall or move to a new computer.
    </p>

    <div style="margin:24px 0 8px;text-align:center;">
      <div style="font-size:11px;color:#8a7a68;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Your license key</div>
      <div style="display:inline-block;background:#faf6ee;border:2px solid #ff8a3d;border-radius:12px;padding:14px 24px;font-size:22px;font-weight:800;letter-spacing:3px;font-family:'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace;color:#1a0f06;">
        ${escapeHtml(input.licenseKey)}
      </div>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Plan", input.tierName)}
      ${receiptRow("Billing", "Monthly")}
      ${receiptRow("Amount paid", formatPHP(input.amountPhp), true)}
    </table>

    <p style="margin:16px 0 0;color:#8a7a68;font-size:13px;line-height:1.6;">
      The app activates this key automatically on the device you just paid from. Your subscription renews monthly — we&rsquo;ll remind you before it&rsquo;s due.
    </p>
  `;
  return sendEmail({
    to: input.to,
    subject: `Your Comffee POS license key · ${input.tierName}`,
    html: chrome({
      preheader: `Your ${input.tierName} subscription is active — license key inside`,
      bodyHtml: body,
    }),
    text: `Welcome to Comffee POS! Your ${input.tierName} subscription is active. License key: ${input.licenseKey}. Amount paid: ${formatPHP(input.amountPhp)} (monthly). Keep this key safe for reinstalls.`,
  });
}

/* ---------------- Partner-Cafe subscription: renewal receipt ---------------- */

interface SubscriptionRenewedInput {
  to: string;
  tierName: string; // e.g. "AI-Integrated"
  amountPhp: number;
  renewedUntil: string; // ISO timestamptz from renew_license — the new term end
}

// Sent to a Partner Cafe when a renewal payment is confirmed and the license term extended (the
// webhook calls renew_license, then fires this). NO license key in here — renewals keep the same
// key, so there's nothing to re-activate; this is just the receipt + new expiry. [[comffee-saas-vision]]
export async function sendSubscriptionRenewed(input: SubscriptionRenewedInput) {
  const d = new Date(input.renewedUntil);
  const untilDate = Number.isNaN(d.getTime())
    ? input.renewedUntil
    : d.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Manila",
      });
  const body = `
    <h1 style="margin:16px 0 8px;font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Subscription renewed
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Your Comffee POS subscription has been renewed &mdash; your <strong>${escapeHtml(input.tierName)}</strong> plan is active until <strong>${escapeHtml(untilDate)}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Plan", input.tierName)}
      ${receiptRow("Active until", untilDate)}
      ${receiptRow("Amount paid", formatPHP(input.amountPhp), true)}
    </table>

    <p style="margin:16px 0 0;color:#8a7a68;font-size:13px;line-height:1.6;">
      Your existing license key keeps working &mdash; nothing to re-activate. We&rsquo;ll remind you before your next renewal is due.
    </p>
  `;
  return sendEmail({
    to: input.to,
    subject: `Your Comffee POS subscription is renewed · ${input.tierName}`,
    html: chrome({
      preheader: `Your ${input.tierName} plan is active until ${untilDate}`,
      bodyHtml: body,
    }),
    text: `Your Comffee POS subscription has been renewed — your ${input.tierName} plan is active until ${untilDate}. Amount paid: ${formatPHP(input.amountPhp)}. Your existing license key keeps working.`,
  });
}

/* ---------------- Game Top-Ups: branded delivery receipt ---------------- */

interface GameTopupReceiptInput {
  to: string;
  orderId: string;
  game: string;
  riotId: string; // "Name#TAG"
  totalVp: number;
  amountPhp: number;
  statusToken: string;
  lines: Array<{ vp: number; pricePhp: number }>;
}

// Sent the moment every line of a Game Top-Up order is confirmed delivered (all Codashop purchases
// landed). This is OUR receipt — our logo, our email — the customer never sees Codashop's. [[design]]
export async function sendGameTopupReceipt(input: GameTopupReceiptInput) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comffee.org";
  const statusUrl = `${siteUrl}/game-topups/status/${input.statusToken}`;
  const gameLabel = input.game ? input.game.charAt(0).toUpperCase() + input.game.slice(1) : "Game";
  const linesHtml = input.lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:6px 0;color:#1a0f06;font-size:14px;">✅ ${escapeHtml(l.vp.toLocaleString())} VP</td>
          <td style="padding:6px 0;color:#5a4a3c;font-size:13px;text-align:right;">${escapeHtml(formatPHP(l.pricePhp))}</td>
        </tr>`,
    )
    .join("");

  const body = `
    <h1 style="margin:16px 0 8px;font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#1a0f06;">
      Delivered — top-up complete.
    </h1>
    <p style="margin:0 0 24px;color:#5a4a3c;font-size:15px;line-height:1.6;">
      Your ${escapeHtml(gameLabel)} top-up for <strong>${escapeHtml(input.riotId)}</strong> has been delivered in full. Thanks for topping up with Comffee!
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#faf6ee;border:1px solid #e8dcc4;border-radius:12px;padding:8px 20px;">
      ${receiptRow("Game", gameLabel)}
      ${receiptRow("Riot ID", input.riotId)}
      ${receiptRow("Total delivered", input.totalVp.toLocaleString() + " VP", true)}
    </table>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // packages
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e8dcc4;">
      ${linesHtml}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-top:2px solid #ff8a3d;padding-top:12px;">
      ${receiptRow("Amount paid", formatPHP(input.amountPhp), true)}
    </table>

    <p style="margin:20px 0 0;color:#2e7d32;font-size:14px;font-weight:700;">PAID — complete.</p>

    <p style="margin:24px 0 8px;color:#8a7a68;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;">
      // order_id
    </p>
    <p style="margin:0;color:#1a0f06;font-size:13px;font-family:'JetBrains Mono',monospace;word-break:break-all;">
      ${escapeHtml(input.orderId)}
    </p>
  `;

  return sendEmail({
    to: input.to,
    subject: `Your ${gameLabel} top-up is delivered · ${input.totalVp.toLocaleString()} VP`,
    html: chrome({
      preheader: `${input.totalVp.toLocaleString()} VP delivered to ${input.riotId}`,
      bodyHtml: body,
      ctaLabel: "View order",
      ctaHref: statusUrl,
    }),
    text: `Your ${gameLabel} top-up for ${input.riotId} is delivered: ${input.totalVp} VP total, ${formatPHP(input.amountPhp)} paid. Status: PAID — complete. Order ID: ${input.orderId}. View: ${statusUrl}`,
  });
}
