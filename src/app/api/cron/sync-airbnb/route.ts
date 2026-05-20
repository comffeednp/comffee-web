import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { runAirbnbSync } from "@/lib/airbnb-sync";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const result = await runAirbnbSync();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
