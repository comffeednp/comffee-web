import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMemberOptional } from "@/lib/auth/require-member";
import { getAdminOptional } from "@/lib/auth/require-admin";
import { listInstructionPhotos, memberHasConfirmedBooking } from "@/lib/branch-instructions";

export const runtime = "nodejs";

/**
 * Returns a branch's instruction photos (check-in, house rules, FAQ) as
 * short-lived signed URLs — but ONLY to an admin or a member who has a
 * confirmed booking at that branch. Everyone else gets an empty list, so the
 * door PINs in those sheets never leak to the public.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = getSupabaseAdmin();
  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!branch) return NextResponse.json({ photos: [] });

  const [member, admin] = await Promise.all([getMemberOptional(), getAdminOptional()]);
  let allowed = !!admin;
  if (!allowed && member) {
    allowed = await memberHasConfirmedBooking(member.id, branch.id);
  }
  if (!allowed) return NextResponse.json({ photos: [] });

  const photos = (await listInstructionPhotos(branch.id)).map((p) => ({
    label: p.label,
    url: p.signedUrl,
  }));
  return NextResponse.json({ photos });
}
