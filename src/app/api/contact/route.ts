import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { guardMutating } from "@/lib/security";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  branch_id: z.string().uuid().optional().or(z.literal("")),
  message: z.string().min(5).max(2000),
  // honeypot — humans never fill this; bots fill every input
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const guarded = await guardMutating(request, {
    bucket: "contact",
    limit: 5,
    windowMs: 5 * 60 * 1000,
    maxBytes: 16 * 1024,
  });
  if ("error" in guarded) return guarded.error;

  const parsed = schema.safeParse(guarded.json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  // Honeypot tripped — fail silently to avoid signaling the bot it was caught
  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const { name, email, phone, branch_id, message } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("contact_form_submissions").insert({
      name,
      email: email || null,
      phone: phone || null,
      branch_id: branch_id || null,
      message,
    });
    if (error) {
      console.error("contact submit error", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("contact submit fatal", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
