import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";

// TEMPORARY diagnostic — reports which email-related env vars are set in this
// deployment. Gated by CRON_SECRET. Remove after debugging.
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return NextResponse.json({
    RESEND_API_KEY_set: !!process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM ?? null,
    ADMIN_NOTIFICATION_EMAIL: process.env.ADMIN_NOTIFICATION_EMAIL ?? null,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  });
}
