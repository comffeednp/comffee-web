import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "branch-photos";
const MAX_BYTES = 20 * 1024 * 1024; // 20MB — no client compression, allow full-res
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function POST(request: Request) {
  // Auth gate — JWT check only (no extra DB round-trip per upload)
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Form data
  const formData = await request.formData();
  const file = formData.get("file");
  const folder = (formData.get("folder") as string) || "uploads";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }
  if (!ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json({ error: "bad_mime" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeFolder = folder.replace(/[^a-z0-9-_/]/gi, "");
  const filename = `${safeFolder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  try {
    const admin = getSupabaseAdmin();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadErr) {
      console.error("upload error", uploadErr);
      return NextResponse.json({ error: "upload_failed", detail: uploadErr.message }, { status: 500 });
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(filename);
    return NextResponse.json({
      ok: true,
      storage_path: filename,
      public_url: pub.publicUrl,
    });
  } catch (e) {
    console.error("upload fatal", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
