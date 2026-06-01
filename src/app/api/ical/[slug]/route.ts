import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildICal } from "@/lib/ical";

export const runtime = "nodejs";

/**
 * Exposes our website-sourced reservations as an iCal feed for a single
 * Playcation branch. The owner pastes this URL into Airbnb's "Import
 * Calendar" feature so Airbnb sees our bookings and won't double-book.
 *
 *   Production URL: https://yoursite.com/api/ical/<branch-slug>
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const supabase = getSupabaseAdmin();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, slug, name, type")
    .eq("slug", slug)
    .maybeSingle();

  if (!branch || branch.type !== "playcation") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, check_in, check_out, status, source, ical_uid")
    .eq("branch_id", branch.id)
    // pending_approval = paid request awaiting the owner; it holds the dates, so
    // export it to Airbnb too (don't let Airbnb double-book a held date).
    .in("status", ["pending_hold", "pending_approval", "confirmed"]);

  const events = (reservations ?? [])
    // Don't echo back airbnb-sourced events — Airbnb already knows about its own
    .filter((r) => r.source !== "airbnb")
    .map((r) => ({
      uid: r.ical_uid ?? `${r.id}@comffe.ph`,
      summary:
        r.status === "confirmed"
          ? "Comffee Playcation booking"
          : "Comffee Playcation hold",
      start: r.check_in,
      end: r.check_out,
    }));

  const body = buildICal(`Comffee Playcation · ${branch.name}`, events);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
