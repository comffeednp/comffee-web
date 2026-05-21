import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
