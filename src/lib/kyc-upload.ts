/**
 * KYC upload preparation + error feedback, shared by the booking verify step.
 *
 * WHY THIS EXISTS: Vercel hard-rejects any request body over 4.5 MB with a
 * platform-level 413 (FUNCTION_PAYLOAD_TOO_LARGE) BEFORE our route code runs —
 * and the error page is not JSON, so a naive `res.json()` throws and the guest
 * saw only "Network error". Raw phone photos are 3–12 MB each and the KYC
 * submit sends three files in one multipart POST, so uncompressed uploads were
 * guaranteed to die on that platform limit. Everything here exists to make a
 * doomed request impossible to send, and to turn every failure that can still
 * happen into a specific, recoverable message.
 *
 * Budgets (must COMPOSE under the 4.5 MB platform cap with multipart overhead —
 * the worst legitimate case is two max-size PDFs + one compressed image, and
 * kyc-upload.test.ts asserts that sum stays inside the pre-flight guard):
 *   image  → compressed client-side to ≤ ~0.9 MB, ≤ 1800 px long edge (plenty
 *            for Google Vision OCR / face detection)
 *   PDF    → can't be compressed in the browser; capped at 1.5 MB each
 *   submit → pre-flight total guard at 4.2 MB so the request never leaves the
 *            phone if it would be platform-rejected
 */

export type PreparedFile = { file: File } | { error: string };

export const IMAGE_MAX_MB = 0.9;
export const IMAGE_MAX_EDGE_PX = 1800;
export const PDF_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
export const SUBMIT_TOTAL_BUDGET_BYTES = Math.floor(4.2 * 1024 * 1024);

const UNREADABLE_IMAGE_MSG =
  "Couldn't read that photo — HEIC and some formats aren't supported here. Use “Take photo” instead, or upload a JPG or PNG.";

export const TOO_LARGE_MSG =
  "Your documents are too large to upload together. Use “Take photo” for each step, or upload smaller images.";

function isPdf(file: File): boolean {
  return (
    (file.type || "").toLowerCase().includes("pdf") ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/** Downscale + re-encode an image to JPEG within the upload budget. */
async function compressImage(file: File): Promise<PreparedFile> {
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const out = await imageCompression(file, {
      maxSizeMB: IMAGE_MAX_MB,
      maxWidthOrHeight: IMAGE_MAX_EDGE_PX,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.85,
    });
    return { file: new File([out], "capture.jpg", { type: "image/jpeg" }) };
  } catch {
    // Decode failure (HEIC on Android, corrupt file) or worker failure.
    return { error: UNREADABLE_IMAGE_MSG };
  }
}

/** Selfie: must be a photo; always compressed. */
export async function prepareKycSelfie(file: File): Promise<PreparedFile> {
  if (isPdf(file)) return { error: "The selfie must be a photo, not a PDF." };
  return compressImage(file);
}

/** ID / billing: photo (compressed) or a small PDF (passed through). */
export async function prepareKycDocument(file: File): Promise<PreparedFile> {
  if (isPdf(file)) {
    if (file.size > PDF_MAX_BYTES) {
      return {
        error:
          "That PDF is too large to upload (max 1.5 MB) — take a photo of the document instead.",
      };
    }
    return { file };
  }
  return compressImage(file);
}

interface SubmitErrorBody {
  error?: string;
  retry_after_seconds?: number;
}

/**
 * Machine error codes the /api/kyc/submit route (and its guards) can return.
 * Anything NOT in this map is a human-written validation message from the
 * server (Vision feedback, per-file size/type errors) and is shown verbatim.
 */
const MACHINE_ERROR_MESSAGES: Record<string, string> = {
  rate_limited:
    "Too many attempts — wait a minute, then tap Submit again. Your photos are kept.",
  bad_origin: "This page looks out of date — refresh it and try again.",
  bad_form: "The upload didn't go through cleanly — tap Submit to retry.",
  missing_fields:
    "One of the documents didn't attach — retake it and submit again.",
  payload_too_large: TOO_LARGE_MSG,
  upload_failed:
    "We couldn't save your documents just now — your photos are kept, tap Submit to retry.",
};

/**
 * Map a failed /api/kyc/submit response to a message a guest can act on.
 * `body` is null when the response wasn't JSON — which is exactly what the
 * Vercel platform's own 413 / 5xx error pages look like.
 */
export function uploadErrorMessage(
  status: number,
  body: SubmitErrorBody | null,
): string {
  if (body?.error) {
    return MACHINE_ERROR_MESSAGES[body.error] ?? body.error;
  }
  if (status === 413) return TOO_LARGE_MSG;
  if (status === 429) return MACHINE_ERROR_MESSAGES.rate_limited;
  if (status >= 500) return MACHINE_ERROR_MESSAGES.upload_failed;
  return "Upload failed — please try again.";
}

/** Message for a fetch that never got a response (thrown/aborted). */
export function uploadNetworkMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return "The upload timed out — your connection is slow. Check your signal and tap Submit to retry. Your photos are kept.";
  }
  return "Connection dropped while uploading — check your internet and tap Submit to retry. Your photos are kept.";
}
