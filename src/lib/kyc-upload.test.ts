import { describe, expect, it } from "vitest";
import {
  IMAGE_MAX_MB,
  PDF_MAX_BYTES,
  SUBMIT_TOTAL_BUDGET_BYTES,
  TOO_LARGE_MSG,
  uploadErrorMessage,
  uploadNetworkMessage,
} from "./kyc-upload";

describe("upload budgets", () => {
  it("keeps the worst-case submit under Vercel's 4.5 MB request cap", () => {
    const VERCEL_CAP = 4.5 * 1024 * 1024;
    // Worst case: two max-size PDFs (id + billing) + one compressed selfie.
    const worstCase = 2 * PDF_MAX_BYTES + IMAGE_MAX_MB * 1024 * 1024;
    expect(worstCase).toBeLessThan(VERCEL_CAP);
    expect(SUBMIT_TOTAL_BUDGET_BYTES).toBeLessThan(VERCEL_CAP);
    // The pre-flight guard must not reject a legitimate worst-case submit.
    expect(worstCase).toBeLessThanOrEqual(SUBMIT_TOTAL_BUDGET_BYTES);
  });
});

describe("uploadErrorMessage", () => {
  it("maps a platform 413 (non-JSON body) to the too-large message, not 'Network error'", () => {
    expect(uploadErrorMessage(413, null)).toBe(TOO_LARGE_MSG);
  });

  it("maps platform 5xx (non-JSON body) to a retryable message", () => {
    expect(uploadErrorMessage(502, null)).toMatch(/tap Submit to retry/i);
    expect(uploadErrorMessage(500, null)).toMatch(/photos are kept/i);
  });

  it("translates the route's machine error codes", () => {
    expect(uploadErrorMessage(429, { error: "rate_limited" })).toMatch(/wait a minute/i);
    expect(uploadErrorMessage(500, { error: "upload_failed" })).toMatch(/retry/i);
    expect(uploadErrorMessage(413, { error: "payload_too_large" })).toBe(TOO_LARGE_MSG);
    expect(uploadErrorMessage(400, { error: "missing_fields" })).toMatch(/didn't attach/i);
    expect(uploadErrorMessage(403, { error: "bad_origin" })).toMatch(/refresh/i);
  });

  it("passes human-written server validation messages through verbatim", () => {
    const visionMsg =
      "No face detected. Take a clear selfie with your face well lit and fully visible.";
    expect(uploadErrorMessage(422, { error: visionMsg })).toBe(visionMsg);
  });

  it("falls back to a generic retry message for unknown statuses", () => {
    expect(uploadErrorMessage(418, null)).toMatch(/try again/i);
  });
});

describe("uploadNetworkMessage", () => {
  it("distinguishes timeouts from dropped connections", () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    expect(uploadNetworkMessage(timeout)).toMatch(/timed out/i);
    expect(uploadNetworkMessage(new TypeError("Failed to fetch"))).toMatch(/connection dropped/i);
  });

  it("never surfaces a raw exception message", () => {
    const ugly = new TypeError("NetworkError when attempting to fetch resource.");
    expect(uploadNetworkMessage(ugly)).not.toMatch(/NetworkError when attempting/);
  });
});
