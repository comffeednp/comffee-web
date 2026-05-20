import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/sumsub";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const digestHeader = request.headers.get("x-payload-digest") ?? "";

  if (!verifyWebhookSignature(rawBody, digestHeader)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const externalUserId = payload.externalUserId as string | undefined;
  const reviewAnswer = (payload as { reviewResult?: { reviewAnswer?: string } })
    .reviewResult?.reviewAnswer;

  if (!externalUserId || !reviewAnswer) {
    return NextResponse.json({ ok: true });
  }

  const kycStatus = reviewAnswer === "GREEN" ? "approved" : "rejected";

  const supabase = getSupabaseAdmin();

  // Update any reservations that used this applicant ID
  await supabase
    .from("reservations")
    .update({ kyc_status: kycStatus })
    .eq("sumsub_applicant_id", externalUserId);

  // If this is a member-linked verification, persist KYC status on the member
  // so future bookings can skip the verify step
  if (externalUserId.startsWith("comffee-member-")) {
    const memberId = externalUserId.slice("comffee-member-".length);
    await supabase
      .from("members")
      .update({ kyc_status: kycStatus, sumsub_applicant_id: externalUserId })
      .eq("id", memberId);
  }

  return NextResponse.json({ ok: true });
}
