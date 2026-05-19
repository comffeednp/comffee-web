import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight health check for uptime monitoring (UptimeRobot, Better Uptime, etc.)
 * Returns 200 if the app + database are reachable. Doesn't expose any internal data.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail" | "skipped"> = {
    app: "ok",
    db: "skipped",
  };

  try {
    const supabase = getSupabaseAdmin();
    // Cheap query — just count one published branch
    const { error } = await supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .limit(1);
    checks.db = error ? "fail" : "ok";
  } catch {
    checks.db = "fail";
  }

  const allOk = Object.values(checks).every((v) => v !== "fail");
  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: allOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
