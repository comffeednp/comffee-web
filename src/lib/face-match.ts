// Pure, dependency-free face-descriptor comparison — safe to import on the SERVER
// (the clock route compares the live descriptor against the enrolled one). A 128-d
// face-api descriptor distance below the threshold = same person. We DON'T run
// face-api on the server (no native deps on Vercel) — the browser computes the
// descriptor, the server only does the vector math here.
//
// Threshold 0.5: face-api's documented default is 0.6, but the POS uses ~0.45 and
// found 0.6 too loose for the cafe. 0.5 is the middle ground — tighten toward 0.45
// if buddy-punching slips through, loosen toward 0.55 if real staff get rejected.
export const FACE_MATCH_THRESHOLD = 0.5;

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** A valid face descriptor is exactly 128 finite numbers. */
export function isValidDescriptor(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === 128 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}
