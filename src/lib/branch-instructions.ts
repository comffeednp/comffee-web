import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Check-in / house-rules / FAQ sheets shown to confirmed guests.
 *
 * These contain door PINs and lockbox codes, so they live in a PRIVATE storage
 * bucket. The per-branch folder (keyed by branch id) is the source of truth —
 * no DB table. Files are surfaced only through short-lived signed URLs, and only
 * to a guest with a confirmed booking (or an admin).
 */
export const INSTRUCTIONS_BUCKET = "branch-instructions";

export interface InstructionPhoto {
  path: string;
  label: string;
  signedUrl: string;
}

/** "01-check-in-instructions.jpg" -> "Check In Instructions" */
function labelFromName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d+[-_]/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** List a branch's instruction photos with fresh signed URLs (default 1h). */
export async function listInstructionPhotos(
  branchId: string,
  expiresInSeconds = 3600,
): Promise<InstructionPhoto[]> {
  const supabase = getSupabaseAdmin();
  const { data: files, error } = await supabase.storage
    .from(INSTRUCTIONS_BUCKET)
    .list(branchId, { sortBy: { column: "name", order: "asc" } });
  if (error || !files?.length) return [];

  const images = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
  if (!images.length) return [];

  const paths = images.map((f) => `${branchId}/${f.name}`);
  const { data: signed } = await supabase.storage
    .from(INSTRUCTIONS_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  // createSignedUrls returns results aligned to the input order.
  return images
    .map((f, i) => {
      const s = signed?.[i];
      if (!s || s.error || !s.signedUrl) return null;
      return { path: paths[i], label: labelFromName(f.name), signedUrl: s.signedUrl };
    })
    .filter((x): x is InstructionPhoto => x !== null);
}

/** True if the member has a confirmed reservation at this branch. */
export async function memberHasConfirmedBooking(
  memberId: string,
  branchId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("reservations")
    .select("id")
    .eq("member_id", memberId)
    .eq("branch_id", branchId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();
  return !!data;
}
