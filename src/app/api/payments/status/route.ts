import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (!data) return NextResponse.json({ status: "not_found" });
  return NextResponse.json({ status: data.status });
}
