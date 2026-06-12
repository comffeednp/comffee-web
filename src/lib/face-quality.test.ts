import { describe, it, expect } from "vitest";
import { judgeFaces } from "./face-quality";

// A clean, frontal, well-exposed single face (a normal phone selfie).
const goodFace = {
  detectionConfidence: 0.98,
  landmarkingConfidence: 0.85,
  panAngle: 3,
  rollAngle: -2,
  tiltAngle: 5,
  blurredLikelihood: "VERY_UNLIKELY" as const,
  underExposedLikelihood: "UNLIKELY" as const,
};

describe("judgeFaces", () => {
  it("accepts a clean frontal face", () => {
    expect(judgeFaces([goodFace])).toEqual({ ok: true, mode: "verified" });
  });

  it("rejects no face (forged descriptor / junk image)", () => {
    const r = judgeFaces([]);
    expect(r.ok).toBe(false);
    expect(r.mode).toBe("closed");
  });

  it("rejects more than one face", () => {
    const r = judgeFaces([goodFace, goodFace]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/one face/i);
  });

  it("rejects a low-confidence detection", () => {
    expect(judgeFaces([{ ...goodFace, detectionConfidence: 0.4 }]).ok).toBe(false);
  });

  it("rejects weak landmarking (no real face structure)", () => {
    expect(judgeFaces([{ ...goodFace, landmarkingConfidence: 0.1 }]).ok).toBe(false);
  });

  it("rejects a face turned away from the camera", () => {
    expect(judgeFaces([{ ...goodFace, panAngle: 55 }]).ok).toBe(false);
    expect(judgeFaces([{ ...goodFace, tiltAngle: -50 }]).ok).toBe(false);
    expect(judgeFaces([{ ...goodFace, rollAngle: 60 }]).ok).toBe(false);
  });

  it("rejects a blurred photo (likely a screen/print replay)", () => {
    expect(judgeFaces([{ ...goodFace, blurredLikelihood: "VERY_LIKELY" }]).ok).toBe(false);
  });

  it("accepts a slightly angled but acceptable face", () => {
    expect(judgeFaces([{ ...goodFace, panAngle: 20, tiltAngle: -15 }]).ok).toBe(true);
  });
});
