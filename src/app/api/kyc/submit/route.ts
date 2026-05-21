import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const OCR_URL = process.env.PADDLEOCR_SERVICE_URL;

async function ocrVerify(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ hint: string; failedStep: "id" | "billing" } | null> {
  if (!OCR_URL) return null; // skip in dev / when service not configured
  const form = new FormData();
  form.append("file", new Blob([buffer.buffer as ArrayBuffer], { type: contentType }), "doc");
  try {
    const res = await fetch(`${OCR_URL}${path}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return null;
    const data = await res.json() as { hint?: string; error?: string };
    const step: "id" | "billing" = path.includes("billing") ? "billing" : "id";
    return { hint: data.hint ?? data.error ?? "Verification failed. Please retake the photo.", failedStep: step };
  } catch {
    return null; // fail open — OCR service unreachable, don't block the user
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }

  const memberId = formData.get("memberId") as string | null;
  const latitude = formData.get("latitude") as string | null;
  const longitude = formData.get("longitude") as string | null;
  const selfie = formData.get("selfie") as File | null;
  const idDoc = formData.get("id_doc") as File | null;
  const billingDoc = formData.get("billing_doc") as File | null;

  if (!memberId || !selfie || !idDoc || !billingDoc) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const toBuffer = async (file: File) => Buffer.from(await file.arrayBuffer());
  const [selfieBuffer, idBuffer, billingBuffer] = await Promise.all([
    toBuffer(selfie),
    toBuffer(idDoc),
    toBuffer(billingDoc),
  ]);

  // OCR validation — runs in parallel, skipped if PADDLEOCR_SERVICE_URL not set
  const [idOcrError, billingOcrError] = await Promise.all([
    ocrVerify("/verify-id", idBuffer, idDoc.type || "image/jpeg"),
    ocrVerify("/verify-billing", billingBuffer, billingDoc.type || "image/jpeg"),
  ]);

  if (idOcrError) {
    return NextResponse.json(
      { error: idOcrError.hint, failedStep: idOcrError.failedStep },
      { status: 422 },
    );
  }
  if (billingOcrError) {
    return NextResponse.json(
      { error: billingOcrError.hint, failedStep: billingOcrError.failedStep },
      { status: 422 },
    );
  }

  // Ensure kyc-documents bucket exists
  await supabase.storage.createBucket("kyc-documents", { public: false }).catch(() => {});

  const ts = Date.now();
  const prefix = `${memberId}/${ts}`;

  const [selfieRes, idRes, billingRes] = await Promise.all([
    supabase.storage.from("kyc-documents").upload(`${prefix}/selfie.jpg`, selfieBuffer, { contentType: "image/jpeg", upsert: true }),
    supabase.storage.from("kyc-documents").upload(`${prefix}/id.jpg`, idBuffer, { contentType: idDoc.type || "image/jpeg", upsert: true }),
    supabase.storage.from("kyc-documents").upload(`${prefix}/billing.jpg`, billingBuffer, { contentType: billingDoc.type || "image/jpeg", upsert: true }),
  ]);

  if (selfieRes.error || idRes.error || billingRes.error) {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  return NextResponse.json({
    ok: true,
    selfieUrl: selfieRes.data.path,
    idUrl: idRes.data.path,
    billingUrl: billingRes.data.path,
    ipAddress,
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
  });
}
