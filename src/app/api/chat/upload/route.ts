import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Guest-side chat photo upload (e.g. sending an ID). Public — but guarded:
 * rate-limited per IP, image-only, size-capped, HEIC auto-converted. Requires a
 * chat session token so it can't be hammered anonymously. Stores in the public
 * branch-photos bucket under chat-uploads/, returns the public URL which the
 * guest then attaches to a chat message via /api/chat/messages.
 */
const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "branch-photos";
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];
const HEIC_MIMES = new Set(["image/heic", "image/heif"]);

export async function POST(request: Request) {
  const limited = rateLimit(request, "chat-upload", 20, 10 * 60 * 1000);
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get("file");
  const sessionToken = String(formData.get("sessionToken") ?? "");
  if (sessionToken.length < 16 || sessionToken.length > 64) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const isHeic =
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif") ||
    HEIC_MIMES.has(file.type);
  if (!isHeic && !ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json({ error: "bad_mime" }, { status: 400 });
  }

  const baseName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = isHeic
    ? `chat-uploads/${baseName}.jpg`
    : `chat-uploads/${baseName}.${file.name.split(".").pop()?.toLowerCase() ?? "jpg"}`;

  try {
    const admin = getSupabaseAdmin();
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    let contentType = file.type || "image/jpeg";
    if (isHeic) {
      const heicConvert = (await import("heic-convert")).default;
      buffer = Buffer.from(await heicConvert({ buffer, format: "JPEG", quality: 0.9 }));
      contentType = "image/jpeg";
    }
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType, cacheControl: "31536000", upsert: false });
    if (uploadErr) {
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(filename);
    return NextResponse.json({ ok: true, url: pub.publicUrl });
  } catch (e) {
    console.error("chat upload failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
