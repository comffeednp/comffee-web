import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Daily Vision-call circuit breaker (billing shield). Atomically increments today's counter via the
// game_topup_try_vision RPC and reports whether we're still under the cap. This is the HARD ceiling on
// Google Vision spend — a bot that gets past the per-IP rate limit + 3-try ladder still can't run the
// bill past `cap` calls/day.
//
// FAIL-OPEN on an infra error (no RPC / DB hiccup), matching the house policy for operationally-critical
// paths: the per-IP rate limit and the 3-try OCR ladder still bound abuse, and a hard-closed breaker on
// a transient DB error would take the whole feature down. The RPC itself is the real protection in
// normal operation.
export async function tryConsumeVisionCall(cap: number): Promise<boolean> {
  if (!Number.isFinite(cap) || cap <= 0) return true; // misconfigured cap → don't hard-block
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("game_topup_try_vision", { p_cap: Math.floor(cap) });
    if (error) return true; // infra error → fail open
    return data === true;
  } catch {
    return true; // infra error → fail open
  }
}
