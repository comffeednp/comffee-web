import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { guardMutating } from "@/lib/security";

export const runtime = "nodejs";

const schema = z.object({
  id: z.string().min(8).max(40),
  contact: z.string().min(3).max(254),
});

/**
 * Public lookup endpoint — anonymous customers retrieve their own order or
 * reservation by ID + a contact field (email or phone) they originally
 * provided. Returns minimal info, never PII beyond what they supplied.
 *
 * Heavily rate-limited (10 per 5 min per IP) + generic errors to prevent
 * enumeration of valid IDs.
 */
export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "lookup",
    limit: 10,
    windowMs: 5 * 60 * 1000,
    maxBytes: 4 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const id = parsed.data.id.trim();
  const contact = parsed.data.contact.trim().toLowerCase();
  const supabase = getSupabaseAdmin();

  // Try reservation first
  try {
    const { data: res } = await supabase
      .from("reservations")
      .select(
        "id, status, check_in, check_out, num_guests, total_php, guest_name, guest_email, guest_phone, branch:branches(name, slug, type)",
      )
      .eq("id", id)
      .maybeSingle();
    if (res) {
      const emailMatch =
        res.guest_email && res.guest_email.toLowerCase() === contact;
      const phoneMatch =
        res.guest_phone &&
        normalizePhone(res.guest_phone) === normalizePhone(contact);
      if (!emailMatch && !phoneMatch) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      const rawBranch = (res as unknown as { branch?: unknown }).branch;
      const branch = pickBranch(rawBranch);
      return NextResponse.json({
        ok: true,
        kind: "reservation",
        data: {
          id: res.id,
          status: res.status,
          check_in: res.check_in,
          check_out: res.check_out,
          num_guests: res.num_guests,
          total_php: res.total_php,
          guest_name: res.guest_name,
          branch: branch ? { name: branch.name, slug: branch.slug } : null,
        },
      });
    }
  } catch (e) {
    console.error("lookup reservation error", e instanceof Error ? e.message : e);
  }

  // Then try order
  try {
    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, status, payment_status, total_php, scheduled_for, customer_name, customer_email, customer_phone, branch:branches(name, slug)",
      )
      .eq("id", id)
      .maybeSingle();
    if (order) {
      const emailMatch =
        order.customer_email && order.customer_email.toLowerCase() === contact;
      const phoneMatch =
        order.customer_phone &&
        normalizePhone(order.customer_phone) === normalizePhone(contact);
      if (!emailMatch && !phoneMatch) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      const branch = pickBranch(
        (order as unknown as { branch?: unknown }).branch,
      );
      // Pull line items
      const { data: items } = await supabase
        .from("order_items")
        .select("name_snapshot, qty, line_total")
        .eq("order_id", order.id);
      return NextResponse.json({
        ok: true,
        kind: "order",
        data: {
          id: order.id,
          status: order.status,
          payment_status: order.payment_status,
          total_php: order.total_php,
          scheduled_for: order.scheduled_for,
          customer_name: order.customer_name,
          branch: branch ? { name: branch.name } : null,
          items: items ?? [],
        },
      });
    }
  } catch (e) {
    console.error("lookup order error", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

function normalizePhone(s: string): string {
  return s.replace(/[^\d]/g, "");
}

/** Supabase foreign-key joins can return either a single object or an array. */
function pickBranch(raw: unknown): { name: string; slug: string } | null {
  if (!raw) return null;
  const obj = Array.isArray(raw) ? raw[0] : raw;
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.slug !== "string") return null;
  return { name: o.name, slug: o.slug };
}
