import { describe, it, expect } from "vitest";
import { eyeAspectRatio, headYaw, type Pt } from "./liveness";

// A synthetic "open eye": 6 points roughly forming an almond. p1/p4 = corners (wide),
// p2/p3 top lid, p5/p6 bottom lid (tall gap = open).
const openEye: Pt[] = [
  { x: 0, y: 5 }, // p1 left corner
  { x: 3, y: 0 }, // p2 top
  { x: 7, y: 0 }, // p3 top
  { x: 10, y: 5 }, // p4 right corner
  { x: 7, y: 10 }, // p5 bottom
  { x: 3, y: 10 }, // p6 bottom
];

// Same eye but lids nearly shut — vertical gap ~1px each (a real blink, EAR ~0.1).
const closedEye: Pt[] = [
  { x: 0, y: 5 },
  { x: 3, y: 4.5 },
  { x: 7, y: 4.5 },
  { x: 10, y: 5 },
  { x: 7, y: 5.5 },
  { x: 3, y: 5.5 },
];

describe("eyeAspectRatio", () => {
  it("is high when the eye is open and low when closed", () => {
    const open = eyeAspectRatio(openEye);
    const closed = eyeAspectRatio(closedEye);
    expect(open).toBeGreaterThan(0.25);
    expect(closed).toBeLessThan(0.19);
    expect(open).toBeGreaterThan(closed);
  });

  it("returns NaN for malformed input", () => {
    expect(Number.isNaN(eyeAspectRatio([{ x: 0, y: 0 }]))).toBe(true);
  });
});

describe("headYaw", () => {
  // Build a minimal 68-point array where only the indices headYaw reads matter:
  // 30 = nose tip, 36 = left-eye outer corner, 45 = right-eye outer corner.
  function landmarksWithNose(noseX: number): Pt[] {
    const pts: Pt[] = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
    pts[36] = { x: 0, y: 50 }; // left outer
    pts[45] = { x: 100, y: 50 }; // right outer
    pts[30] = { x: noseX, y: 60 }; // nose tip
    return pts;
  }

  it("is ~0 when the nose is centered (looking straight)", () => {
    expect(Math.abs(headYaw(landmarksWithNose(50)))).toBeLessThan(0.05);
  });

  it("is positive when the nose shifts toward the right corner (turned left)", () => {
    expect(headYaw(landmarksWithNose(80))).toBeGreaterThan(0.18);
  });

  it("is negative when the nose shifts toward the left corner (turned right)", () => {
    expect(headYaw(landmarksWithNose(20))).toBeLessThan(-0.18);
  });
});
