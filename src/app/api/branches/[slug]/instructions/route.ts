import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Check-in instruction photos (door PINs, house rules) are now EMAIL-ONLY — they are attached to
 * the confirmed-booking email (see lib/email.ts + the payment-confirm / PayMongo webhook). They are
 * intentionally NOT served to the browser anymore: the old gate leaked them after a booking had
 * ended and across other branches. This endpoint now always returns an empty list.
 */
export async function GET() {
  return NextResponse.json({ photos: [] });
}
