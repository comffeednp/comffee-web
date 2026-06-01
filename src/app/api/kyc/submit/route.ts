import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { originAllowed, rateLimit } from "@/lib/security";

export const runtime = "nodejs";

// This endpoint necessarily uses the service-role client (writes to a PRIVATE
// bucket) and calls a BILLED Google Vision API — and the booking flow that uses
// it is open to not-logged-in guests. So it cannot require auth, but it MUST be
// bounded: same-origin only, IP rate-limited, total + per-file size capped, and
// image/PDF MIME only. The storage folder is SERVER-generated (never the caller's
// memberId) so no one can write into another booking's folder or traverse paths.
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // whole multipart payload (3 files + fields)
const MAX_FILE_BYTES = 12 * 1024 * 1024; // per file
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const DOC_TYPES = new Set([...IMAGE_TYPES, "application/pdf"]); // id/billing may be a PDF

const VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

const PH_ID_KEYWORDS = [
  "REPUBLIC OF THE PHILIPPINES",
  "PHILIPPINE IDENTIFICATION",
  "PHILSYS",
  "DRIVER'S LICENSE", "DRIVER S LICENSE",
  "LAND TRANSPORTATION",
  "UNIFIED MULTI-PURPOSE", "UMID",
  "SOCIAL SECURITY",
  "PASSPORT",
  "PROFESSIONAL REGULATION",
  "PHILHEALTH",
  "VOTER",
  "COMELEC",
  "SENIOR CITIZEN",
  "NBI CLEARANCE", "NATIONAL BUREAU",
  "BARANGAY",
  "OFW", "OVERSEAS WORKERS",
];

const UTILITY_KEYWORDS = [
  "MERALCO", "MANILA ELECTRIC",
  "MAYNILAD", "MANILA WATER",
  "CONVERGE",
  "PLDT",
  "GLOBE",
  "SMART",
  "SKY CABLE", "CIGNAL",
  "VECO", "DAVAO LIGHT",
];

interface TextResult {
  configured: boolean;
  text: string | null; // null = pdf or API error (fail open); "" = no text detected
}

async function extractText(buffer: Buffer, contentType: string): Promise<TextResult> {
  if (!VISION_API_KEY) return { configured: false, text: null };
  if (contentType.includes("pdf")) return { configured: true, text: null }; // admin reviews manually

  const body = {
    requests: [{
      image: { content: buffer.toString("base64") },
      features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
    }],
  };
  try {
    const res = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { configured: true, text: null };
    const data = await res.json() as {
      responses?: Array<{ textAnnotations?: Array<{ description: string }> }>;
    };
    const description = data.responses?.[0]?.textAnnotations?.[0]?.description;
    return { configured: true, text: description ?? "" };
  } catch {
    return { configured: true, text: null };
  }
}

async function verifySelfie(buffer: Buffer): Promise<string | null> {
  if (!VISION_API_KEY) return null;
  const body = {
    requests: [{
      image: { content: buffer.toString("base64") },
      features: [{ type: "FACE_DETECTION", maxResults: 5 }],
    }],
  };
  try {
    const res = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      responses?: Array<{ faceAnnotations?: Array<unknown> }>;
    };
    const faces = data.responses?.[0]?.faceAnnotations ?? [];
    if (faces.length === 0) {
      return "No face detected. Take a clear selfie with your face well lit and fully visible.";
    }
    return null;
  } catch {
    return null;
  }
}

async function verifyId(buffer: Buffer, contentType: string): Promise<string | null> {
  const { configured, text } = await extractText(buffer, contentType);
  if (!configured || text === null) return null; // fail open when not configured or API error

  const upper = text.toUpperCase();
  if (PH_ID_KEYWORDS.some((kw) => upper.includes(kw))) return null;

  if (text.trim().length < 20) {
    return "Could not read your ID — make sure it is well lit, in focus, and the full text is clearly visible.";
  }
  return "Upload a clear photo of a Philippine government-issued ID (PhilSys, UMID, Driver's License, Passport, etc.).";
}

async function verifyBilling(buffer: Buffer, contentType: string): Promise<string | null> {
  const { configured, text } = await extractText(buffer, contentType);
  if (!configured || text === null) return null;

  const upper = text.toUpperCase();
  if (UTILITY_KEYWORDS.some((kw) => upper.includes(kw))) return null;

  if (text.trim().length < 20) {
    return "Could not read your billing statement — make sure it is well lit, in focus, and the text is clearly visible.";
  }
  return "Must be a billing statement from Meralco, Maynilad, Converge, PLDT, Globe, or similar utility provider.";
}

export async function POST(request: Request) {
  // ── Abuse guards (run before reading the body) ──
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const limited = rateLimit(request, "kyc-submit", 6, 60_000); // 6 submits/min/IP
  if (limited) return limited;
  const declaredLen = Number(request.headers.get("content-length") ?? 0);
  if (declaredLen > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

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

  // Per-file size + MIME validation (before any buffering or Vision call).
  const fileChecks: Array<{ label: "selfie" | "id" | "billing"; file: File; allowed: Set<string> }> = [
    { label: "selfie", file: selfie, allowed: IMAGE_TYPES },
    { label: "id", file: idDoc, allowed: DOC_TYPES },
    { label: "billing", file: billingDoc, allowed: DOC_TYPES },
  ];
  for (const { label, file, allowed } of fileChecks) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${label} file is too large (max 12 MB).`, failedStep: label }, { status: 413 });
    }
    if (!allowed.has((file.type || "").toLowerCase())) {
      return NextResponse.json({ error: `Unsupported file type for ${label}. Upload a JPG, PNG${allowed.has("application/pdf") ? ", or PDF" : ""}.`, failedStep: label }, { status: 415 });
    }
  }

  const toBuffer = async (file: File) => Buffer.from(await file.arrayBuffer());
  const [selfieBuffer, idBuffer, billingBuffer] = await Promise.all([
    toBuffer(selfie),
    toBuffer(idDoc),
    toBuffer(billingDoc),
  ]);

  const [selfieError, idError, billingError] = await Promise.all([
    verifySelfie(selfieBuffer),
    verifyId(idBuffer, idDoc.type || "image/jpeg"),
    verifyBilling(billingBuffer, billingDoc.type || "image/jpeg"),
  ]);

  if (selfieError) {
    return NextResponse.json({ error: selfieError, failedStep: "selfie" }, { status: 422 });
  }
  if (idError) {
    return NextResponse.json({ error: idError, failedStep: "id" }, { status: 422 });
  }
  if (billingError) {
    return NextResponse.json({ error: billingError, failedStep: "billing" }, { status: 422 });
  }

  await supabase.storage.createBucket("kyc-documents", { public: false }).catch(() => {});

  // Server-generated folder. The caller-supplied memberId is sanitized to a flat
  // label only (no path separators / traversal) and a random UUID guarantees the
  // path is unguessable and collision-free — a caller can never target or
  // overwrite another booking's documents.
  const safeMember = (memberId || "guest").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "guest";
  const prefix = `${safeMember}/${randomUUID()}`;

  const [selfieRes, idRes, billingRes] = await Promise.all([
    supabase.storage.from("kyc-documents").upload(`${prefix}/selfie.jpg`, selfieBuffer, { contentType: "image/jpeg", upsert: false }),
    supabase.storage.from("kyc-documents").upload(`${prefix}/id.jpg`, idBuffer, { contentType: idDoc.type || "image/jpeg", upsert: false }),
    supabase.storage.from("kyc-documents").upload(`${prefix}/billing.jpg`, billingBuffer, { contentType: billingDoc.type || "image/jpeg", upsert: false }),
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
