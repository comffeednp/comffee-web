import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeLicenseActive, ProvisionError } from "@/lib/provisioning";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

// Central email relay for the POS (2026-06-22). Cafes no longer configure their own Gmail — the POS
// POSTs the recipient + subject + body here, we authenticate by license (must exist + be active + bound
// to the calling machine), rate-limit it, and send through the site's own Resend sender. Covers both
// the shift-close report and the Void/Cash/Expense approval codes.
//   -> { ok: true, id } | { ok: false, error }
const LICENSE_RE = /^CMFE(-[A-Z0-9]{4}){3}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest) {
  let body: {
    licenseKey?: string;
    machineId?: string;
    to?: string | string[];
    subject?: string;
    html?: string;
    text?: string;
    replyTo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const licenseKey = String(body.licenseKey ?? "").trim().toUpperCase();
  const machineId = body.machineId ? String(body.machineId) : null;
  if (!LICENSE_RE.test(licenseKey)) {
    return NextResponse.json({ ok: false, error: "invalid_license" }, { status: 400 });
  }

  // Recipients — 1..5 valid addresses.
  const recipients = (Array.isArray(body.to) ? body.to : [body.to])
    .map((r) => String(r ?? "").trim())
    .filter(Boolean);
  if (!recipients.length || recipients.length > 5 || recipients.some((r) => !EMAIL_RE.test(r))) {
    return NextResponse.json({ ok: false, error: "invalid_recipient" }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim().slice(0, 300);
  const html = typeof body.html === "string" && body.html.trim() ? body.html : undefined;
  const text = typeof body.text === "string" && body.text.trim() ? body.text : undefined;
  const replyTo =
    body.replyTo && EMAIL_RE.test(String(body.replyTo).trim()) ? String(body.replyTo).trim() : undefined;
  if (!subject || (!html && !text)) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  }

  // Gate: valid, active license bound to this machine (any tier).
  try {
    await authorizeLicenseActive(licenseKey, machineId);
  } catch (e) {
    if (e instanceof ProvisionError) {
      return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    }
    console.error("[pos-email] auth failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "auth_failed" }, { status: 502 });
  }

  // Abuse guard: cap per license so a compromised/looping POS can't blast mail through our sender.
  const rl = checkRateLimit(`pos-email:${licenseKey}`, 60, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const r = await sendEmail({
    to: recipients,
    subject,
    html: html ?? `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${text}</pre>`,
    text,
    replyTo,
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error || "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
