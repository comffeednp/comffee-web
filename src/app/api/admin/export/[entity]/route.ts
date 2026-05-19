import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toCsv, csvFilename, type CsvCell } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["orders", "bookings", "members", "internet-reservations", "contact-submissions"] as const;
type Entity = (typeof ALLOWED)[number];

async function requireAdminApi() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return admin ? { id: admin.id as string } : null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ entity: string }> },
) {
  const { entity } = await ctx.params;
  if (!ALLOWED.includes(entity as Entity)) {
    return NextResponse.json({ error: "unknown_entity" }, { status: 404 });
  }

  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  let csv: string;
  let name: string;

  switch (entity as Entity) {
    case "orders": {
      const { data } = await sb
        .from("orders")
        .select("*, branch:branches(name), order_items(name_snapshot, qty, line_total)")
        .order("created_at", { ascending: false })
        .limit(10000);
      type Row = {
        id: string;
        created_at: string;
        customer_name: string;
        customer_email: string | null;
        customer_phone: string | null;
        total_php: number;
        discount_php: number | null;
        status: string;
        payment_status: string;
        scheduled_for: string | null;
        notes: string | null;
        branch?: { name?: string } | { name?: string }[] | null;
        order_items?: Array<{ name_snapshot: string; qty: number; line_total: number }>;
      };
      const rows = ((data ?? []) as Row[]).map((o) => {
        const branch = Array.isArray(o.branch) ? o.branch[0] : o.branch;
        const items = (o.order_items ?? [])
          .map((it) => `${it.qty}× ${it.name_snapshot}`)
          .join("; ");
        return {
          id: o.id,
          created_at: o.created_at,
          branch: branch?.name ?? "",
          customer: o.customer_name,
          email: o.customer_email ?? "",
          phone: o.customer_phone ?? "",
          status: o.status,
          payment: o.payment_status,
          scheduled_for: o.scheduled_for ?? "",
          discount_php: o.discount_php ?? 0,
          total_php: o.total_php,
          items,
          notes: o.notes ?? "",
        } satisfies Record<string, CsvCell>;
      });
      csv = toCsv(rows, [
        { key: "id", label: "Order ID" },
        { key: "created_at", label: "Created" },
        { key: "branch", label: "Branch" },
        { key: "customer", label: "Customer" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status" },
        { key: "payment", label: "Payment" },
        { key: "scheduled_for", label: "Ready by" },
        { key: "discount_php", label: "Discount (PHP)" },
        { key: "total_php", label: "Total (PHP)" },
        { key: "items", label: "Items" },
        { key: "notes", label: "Notes" },
      ]);
      name = csvFilename("orders");
      break;
    }

    case "bookings": {
      const { data } = await sb
        .from("reservations")
        .select("*, branch:branches(name)")
        .order("created_at", { ascending: false })
        .limit(10000);
      type Row = {
        id: string;
        created_at: string;
        source: string;
        status: string;
        check_in: string;
        check_out: string;
        guest_name: string | null;
        guest_email: string | null;
        guest_phone: string | null;
        num_guests: number | null;
        total_php: number | null;
        discount_php: number | null;
        paymongo_intent_id: string | null;
        notes: string | null;
        branch?: { name?: string } | { name?: string }[] | null;
      };
      const rows = ((data ?? []) as Row[]).map((r) => {
        const branch = Array.isArray(r.branch) ? r.branch[0] : r.branch;
        return {
          id: r.id,
          created_at: r.created_at,
          source: r.source,
          status: r.status,
          branch: branch?.name ?? "",
          guest: r.guest_name ?? "",
          email: r.guest_email ?? "",
          phone: r.guest_phone ?? "",
          check_in: r.check_in,
          check_out: r.check_out,
          guests: r.num_guests ?? "",
          discount_php: r.discount_php ?? 0,
          total_php: r.total_php ?? 0,
          paymongo_id: r.paymongo_intent_id ?? "",
          notes: r.notes ?? "",
        } satisfies Record<string, CsvCell>;
      });
      csv = toCsv(rows, [
        { key: "id", label: "Booking ID" },
        { key: "created_at", label: "Created" },
        { key: "source", label: "Source" },
        { key: "status", label: "Status" },
        { key: "branch", label: "Branch" },
        { key: "guest", label: "Guest" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "check_in", label: "Check in" },
        { key: "check_out", label: "Check out" },
        { key: "guests", label: "Guests" },
        { key: "discount_php", label: "Discount (PHP)" },
        { key: "total_php", label: "Total (PHP)" },
        { key: "paymongo_id", label: "PayMongo ID" },
        { key: "notes", label: "Notes" },
      ]);
      name = csvFilename("bookings");
      break;
    }

    case "members": {
      const { data } = await sb
        .from("members")
        .select("id, member_number, full_name, email, phone, status, joined_at")
        .order("joined_at", { ascending: false })
        .limit(10000);
      type Row = {
        id: string;
        member_number: string | null;
        full_name: string;
        email: string | null;
        phone: string | null;
        status: string;
        joined_at: string;
      };
      const rows = ((data ?? []) as Row[]).map((m) => ({
        member_number: m.member_number ?? "",
        full_name: m.full_name,
        email: m.email ?? "",
        phone: m.phone ?? "",
        status: m.status,
        joined_at: m.joined_at,
        id: m.id,
      } satisfies Record<string, CsvCell>));
      csv = toCsv(rows, [
        { key: "member_number", label: "Member #" },
        { key: "full_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status" },
        { key: "joined_at", label: "Joined" },
        { key: "id", label: "Internal ID" },
      ]);
      name = csvFilename("members");
      break;
    }

    case "internet-reservations": {
      const { data } = await sb
        .from("internet_reservations")
        .select(
          "id, station_label, requested_start, requested_end, actual_start, actual_end, status, prepaid_php, time_extended_minutes, created_at, member:members(full_name, member_number), branch:branches(name)",
        )
        .order("created_at", { ascending: false })
        .limit(10000);
      type Row = {
        id: string;
        station_label: string;
        requested_start: string;
        requested_end: string;
        actual_start: string | null;
        actual_end: string | null;
        status: string;
        prepaid_php: number | null;
        time_extended_minutes: number | null;
        created_at: string;
        member?: { full_name?: string; member_number?: string | null } | { full_name?: string; member_number?: string | null }[] | null;
        branch?: { name?: string } | { name?: string }[] | null;
      };
      const rows = ((data ?? []) as Row[]).map((r) => {
        const m = Array.isArray(r.member) ? r.member[0] : r.member;
        const b = Array.isArray(r.branch) ? r.branch[0] : r.branch;
        return {
          id: r.id,
          created_at: r.created_at,
          member: m?.full_name ?? "",
          member_number: m?.member_number ?? "",
          branch: b?.name ?? "",
          station: r.station_label,
          status: r.status,
          requested_start: r.requested_start,
          requested_end: r.requested_end,
          actual_start: r.actual_start ?? "",
          actual_end: r.actual_end ?? "",
          extended_minutes: r.time_extended_minutes ?? 0,
          prepaid_php: r.prepaid_php ?? 0,
        } satisfies Record<string, CsvCell>;
      });
      csv = toCsv(rows, [
        { key: "id", label: "ID" },
        { key: "created_at", label: "Created" },
        { key: "member", label: "Member" },
        { key: "member_number", label: "Member #" },
        { key: "branch", label: "Branch" },
        { key: "station", label: "Station" },
        { key: "status", label: "Status" },
        { key: "requested_start", label: "Requested start" },
        { key: "requested_end", label: "Requested end" },
        { key: "actual_start", label: "Actual start" },
        { key: "actual_end", label: "Actual end" },
        { key: "extended_minutes", label: "Extended (min)" },
        { key: "prepaid_php", label: "Prepaid (PHP)" },
      ]);
      name = csvFilename("internet-reservations");
      break;
    }

    case "contact-submissions": {
      const { data } = await sb
        .from("contact_form_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10000);
      type Row = {
        id: string;
        created_at: string;
        name: string;
        email: string | null;
        phone: string | null;
        message: string;
        handled: boolean;
        handled_at: string | null;
      };
      const rows = ((data ?? []) as Row[]).map((s) => ({
        id: s.id,
        created_at: s.created_at,
        name: s.name,
        email: s.email ?? "",
        phone: s.phone ?? "",
        message: s.message,
        handled: s.handled,
        handled_at: s.handled_at ?? "",
      } satisfies Record<string, CsvCell>));
      csv = toCsv(rows, [
        { key: "id", label: "ID" },
        { key: "created_at", label: "Created" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "message", label: "Message" },
        { key: "handled", label: "Handled" },
        { key: "handled_at", label: "Handled at" },
      ]);
      name = csvFilename("contact-submissions");
      break;
    }
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
