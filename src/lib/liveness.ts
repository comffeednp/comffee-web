// Browser active-liveness math — PURE functions so they can be unit-tested without
// a camera. The LivenessCapture component feeds these face-api 68-point landmarks and
// uses the results to drive a randomized blink + head-turn challenge. The goal is to
// defeat a held-up PHOTO of a co-worker (a still image can't blink or turn naturally).
//
// HONEST LIMITS (read before trusting): this is a deterrent, not unspoofable. A video
// of the co-worker on a second screen, or a forged API request, can still pass. It's
// the free tier the owner chose; a paid liveness SDK is the upgrade path. The numeric
// thresholds below are STARTING GUESSES — they MUST be calibrated on a real phone (the
// component shows a live debug readout for exactly this). Different cameras/lighting
// shift EAR and yaw values.

export interface Pt {
  x: number;
  y: number;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Eye Aspect Ratio (Soukupová & Čech 2016). Open eye ~0.3; a blink drops it toward
 * ~0.1. Expects the 6 face-api eye points in order [p1..p6] (corner, top×2, corner,
 * bottom×2). EAR = (|p2-p6| + |p3-p5|) / (2·|p1-p4|).
 */
export function eyeAspectRatio(eye: Pt[]): number {
  if (eye.length < 6) return Number.NaN;
  const vert = dist(eye[1], eye[5]) + dist(eye[2], eye[4]);
  const horiz = 2 * dist(eye[0], eye[3]);
  if (horiz === 0) return Number.NaN;
  return vert / horiz;
}

// NO blink challenge any more. It was tried (fixed cutoff, then relative-to-own-baseline) and
// abandoned: on the owner's phone, face-api reported EAR ~0.24+ even with eyes FULLY shut (open
// ~0.28) — the camera/landmark model never registers a closed eye, so no threshold could work.
// Liveness is now two opposite head-turns (see LivenessCapture). EAR is still computed, used only
// here as a simple "eyes open enough" gate to pick a clean frontal frame for the identity lock.
export const BLINK_EAR_OPEN = 0.23;

/**
 * Signed head-yaw proxy in [-1, 1] from the 68-point landmarks. We don't need true
 * degrees — only "did they turn enough?". Compares how far the nose tip (pt 30) sits
 * from the left-eye outer corner (pt 36) vs the right-eye outer corner (pt 45),
 * normalised by inter-corner distance. ~0 looking straight; grows toward ±1 on turn.
 * Sign: positive = nose nearer the right corner = head turned to the subject's LEFT.
 */
export function headYaw(landmarks: Pt[]): number {
  if (landmarks.length < 68) return 0;
  const nose = landmarks[30];
  const leftOuter = landmarks[36];
  const rightOuter = landmarks[45];
  const span = dist(leftOuter, rightOuter);
  if (span === 0) return 0;
  const dLeft = dist(nose, leftOuter);
  const dRight = dist(nose, rightOuter);
  return (dLeft - dRight) / span;
}

// How far the yaw proxy must move from neutral to count as a deliberate turn.
// A real ~45° turn reads ≈0.60 on the test phone; 0.25 is a clear, easy-to-hit bar (either direction).
export const YAW_TURN_MIN = 0.25;
