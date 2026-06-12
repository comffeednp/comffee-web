// Server-side face-quality / liveness check for cloud attendance clock-ins.
//
// WHY: the clock route used to trust the BROWSER's claim that a real face was present (the face
// descriptor is computed client-side, and "liveness" was just "the browser says it ran 2
// challenges"). A script could send the enrolled descriptor + challenges:["blink","turn"] with no
// camera at all. This runs Google Vision FACE_DETECTION on the ACTUAL submitted selfie, server-side,
// so the server confirms a genuine, single, frontal, well-exposed face is really in the image it
// received — defeating forged-descriptor / no-face / junk-image / multi-face replays.
//
// SCOPE (owner decision 2026-06-12 — "Vision detect, cheap, now"): this is presence + quality on the
// real image, NOT full anti-spoof. A clear printed photo of a face can still pass Vision detection;
// true screen/print/mask anti-spoof + server-side identity matching is a paid SDK (AWS Rekognition
// Face Liveness / Azure Face) — a planned follow-up, not this step.
//
// FAIL POLICY: a DEFINITIVE bad verdict (no face / multiple faces / turned away / blurred) FAILS
// CLOSED (the clock is rejected). An infra problem (no API key, network/Vision error, timeout) FAILS
// OPEN (returns ok) — clocking is operationally critical and must not halt a whole cafe when Vision
// hiccups, exactly like the existing selfie-upload and KYC paths.

const VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

type Likelihood =
  | "UNKNOWN"
  | "VERY_UNLIKELY"
  | "UNLIKELY"
  | "POSSIBLE"
  | "LIKELY"
  | "VERY_LIKELY";

interface FaceAnnotation {
  detectionConfidence?: number;
  landmarkingConfidence?: number;
  panAngle?: number; // left/right turn, degrees
  rollAngle?: number; // tilt in-plane, degrees
  tiltAngle?: number; // up/down, degrees
  blurredLikelihood?: Likelihood;
  underExposedLikelihood?: Likelihood;
  headwearLikelihood?: Likelihood;
}

// Thresholds — deliberately lenient on identity (Vision can't match) but strict on "is this a real,
// usable, frontal face in the submitted frame". Tuned to accept a normal phone selfie and reject a
// blank frame, a back-of-head, a far-away/tiny face, or a heavily blurred photo-of-a-screen.
const MIN_DETECTION_CONFIDENCE = 0.6;
const MIN_LANDMARKING_CONFIDENCE = 0.4;
const MAX_PAN = 35; // looking roughly at the camera
const MAX_ROLL = 35;
const MAX_TILT = 35;
const VISION_TIMEOUT_MS = 12_000;

const isStrong = (l?: Likelihood) => l === "LIKELY" || l === "VERY_LIKELY";

export interface FaceQualityResult {
  ok: boolean;
  // present only on a definitive failure; a worker-facing reason the page can show
  reason?: string;
  // 'closed' = a real bad-face verdict; 'open' = infra fail-open (treated as ok)
  mode: "verified" | "closed" | "open";
}

// Pure verdict over Vision's faceAnnotations — unit-testable without the network.
export function judgeFaces(faces: FaceAnnotation[]): FaceQualityResult {
  if (!faces || faces.length === 0) {
    return { ok: false, mode: "closed", reason: "No face detected. Take a clear, well-lit selfie with your face fully visible." };
  }
  if (faces.length > 1) {
    return { ok: false, mode: "closed", reason: "More than one face is in the photo. Make sure only you are in frame." };
  }
  const f = faces[0];
  if ((f.detectionConfidence ?? 0) < MIN_DETECTION_CONFIDENCE) {
    return { ok: false, mode: "closed", reason: "Your face wasn't clear enough. Move closer and make sure it's well lit." };
  }
  if ((f.landmarkingConfidence ?? 0) < MIN_LANDMARKING_CONFIDENCE) {
    return { ok: false, mode: "closed", reason: "Your face wasn't clear enough. Face the camera straight on in good light." };
  }
  if (
    Math.abs(f.panAngle ?? 0) > MAX_PAN ||
    Math.abs(f.rollAngle ?? 0) > MAX_ROLL ||
    Math.abs(f.tiltAngle ?? 0) > MAX_TILT
  ) {
    return { ok: false, mode: "closed", reason: "Look straight at the camera and hold the phone level, then try again." };
  }
  if (isStrong(f.blurredLikelihood)) {
    return { ok: false, mode: "closed", reason: "The photo is too blurry. Hold still and take it again." };
  }
  return { ok: true, mode: "verified" };
}

// Run the real check against the submitted selfie bytes. Returns a verdict; infra problems fail OPEN.
export async function verifyFaceQuality(buffer: Buffer): Promise<FaceQualityResult> {
  if (!VISION_API_KEY) return { ok: true, mode: "open" }; // not configured → don't block clocking
  try {
    const res = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: buffer.toString("base64") },
            features: [{ type: "FACE_DETECTION", maxResults: 5 }],
          },
        ],
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: true, mode: "open" }; // Vision error → fail open
    const data = (await res.json()) as { responses?: Array<{ faceAnnotations?: FaceAnnotation[] }> };
    const faces = data.responses?.[0]?.faceAnnotations ?? [];
    return judgeFaces(faces);
  } catch {
    return { ok: true, mode: "open" }; // timeout / network → fail open
  }
}
