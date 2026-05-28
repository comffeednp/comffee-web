import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendBranchEditSubmittedEmail } from "@/lib/email";

export const runtime = "nodejs";

// Cafe owners submit page-edit forms through the POS "Reservation" tab. The POS authenticates
// with the website service-role key (the same key it already uses for cash-move + receipt sync).
// We compare the Bearer token to SUPABASE_SERVICE_ROLE_KEY to keep this endpoint internal —
// public visitors and the anon key cannot reach it. [[comffee-saas-vision]] Stage 4a.
//
// Body shape:
//   {
//     branchId?:     uuid,          // existing branch being edited (Lagro/SJDM today)
//     proposedSlug?: string,        // NEW branch being proposed (future SaaS partner onboarding)
//     submittedBy:   string,        // license key / machine id — audit trail
//     payload:       object,        // full form JSON — fields, photos, amenities, rates, gcash QR
//     changeSummary: string[]       // short bullets shown in the notification email + admin panel
//   }
// Exactly one of branchId or proposedSlug is required. The endpoint stores the payload as JSONB
// and emails the owner via Resend (bookings@comffee.org); the admin clicks Approve/Reject inline
// on /admin/branches/<id>.

const OWNER_EMAIL = process.env.APPROVAL_EMAIL_TO ?? "johnjosephtopacio@gmail.com";

const schema = z
  .object({
    branchId: z.string().uuid().optional(),
    proposedSlug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, hyphens").optional(),
    submittedBy: z.string().min(1).max(200),
    payload: z.record(z.string(), z.unknown()),
    changeSummary: z.array(z.string()).default([]),
  })
  .refine((v) => !!(v.branchId || v.proposedSlug), {
    message: "branchId or proposedSlug is required",
  });

export async function POST(req: NextRequest) {
  // Bearer-token auth — must match the service-role key. NOT user-session auth (the POS isn't a
  // signed-in browser; it has the service key locally and posts directly).
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { branchId, proposedSlug, submittedBy, payload, changeSummary } = parsed.data;

  const admin = getSupabaseAdmin();

  // Resolve branch name (used in the email subject + body)
  let branchName = "Unknown";
  if (branchId) {
    const { data: b } = await admin
      .from("branches")
      .select("name")
      .eq("id", branchId)
      .maybeSingle();
    branchName = b?.name ?? "Unknown branch";
  } else if (proposedSlug) {
    branchName = `[NEW] ${proposedSlug}`;
  }

  const { data: inserted, error: insErr } = await admin
    .from("branch_edit_submissions")
    .insert({
      branch_id: branchId ?? null,
      proposed_slug: proposedSlug ?? null,
      submitted_by: submittedBy,
      payload,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: "save_failed", detail: insErr?.message },
      { status: 500 },
    );
  }

  // Notify the owner. Fire-and-forget — the submission is already saved; an email failure here
  // shouldn't block the POS's success response (the owner can still find pending edits in admin).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.comffee.org";
  const branchAdminUrl = branchId
    ? `${siteUrl}/admin/branches/${branchId}`
    : `${siteUrl}/admin/branches`;
  void sendBranchEditSubmittedEmail({
    to: OWNER_EMAIL,
    branchName,
    submittedBy,
    branchAdminUrl,
    changeSummary,
  }).catch((e: unknown) =>
    console.warn("[branch-edit submit] email failed:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true, submissionId: inserted.id });
}
