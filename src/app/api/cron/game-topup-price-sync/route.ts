import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { runPriceSync } from "@/lib/game-topups/price-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Codashop price-sync. The work lives in runPriceSync() (shared with the admin "Pull now" button);
// this route only gates it behind the cron secret. See src/lib/game-topups/price-sync.ts for the rules.
async function handle(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: auth.status });

  const result = await runPriceSync();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
