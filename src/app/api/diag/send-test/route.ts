import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";

// TEMPORARY: performs a real Resend send using production config and returns
// Resend's exact response, so we can see success or the precise failure reason.
// Gated by CRON_SECRET. Remove after debugging.
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const from = process.env.RESEND_FROM ?? "Comffee Drink and Play <onboarding@resend.dev>";
  const to = (process.env.ADMIN_NOTIFICATION_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ error: "RESEND_API_KEY missing" });
  if (!to.length) return NextResponse.json({ error: "ADMIN_NOTIFICATION_EMAIL empty" });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to,
      subject: "Comffee diagnostic — test alert",
      html: "<p>This is a test email from the Comffee diagnostic endpoint. If you got this, Resend delivery works.</p>",
    }),
  });
  const body = await res.text();
  return NextResponse.json({ from, to, resendStatus: res.status, resendBody: body });
}
