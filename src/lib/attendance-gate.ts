// The attendance clock-in DECISION, as one pure function so it can be loop-tested
// without a camera, phone, or database. The /clock route gathers the facts (is the
// staff approved, is a device bound, how far is the face/location) and then calls
// this to decide allow/deny. Keeping it pure means the test exercises the SAME logic
// the route runs — not a copy.
import { FACE_MATCH_THRESHOLD } from "./face-match";

export type ClockGateInput = {
  staffStatus: string; // 'pending' | 'approved' | 'rejected' | 'disabled'
  enrolled: boolean; // staff has an enrolled face descriptor
  challengesCount: number; // liveness challenges the browser completed (turn + turn-back = 2)
  deviceBound: boolean; // a phone is already bound to this staff
  deviceMatches: boolean; // the phone clocking in matches the bound one
  faceDistance: number; // distance between live face and enrolled face (lower = closer)
  geofenceRequired: boolean;
  haveLocation: boolean; // GPS was provided
  distanceM: number | null; // metres from the branch
  radiusM: number; // allowed radius
};

export type ClockDenial =
  | "not_approved"
  | "not_enrolled"
  | "liveness_incomplete"
  | "device_mismatch"
  | "face_mismatch"
  | "no_location"
  | "outside_geofence";

export type ClockGateResult = { ok: true } | { ok: false; error: ClockDenial };

// Order matters: cheapest / most-fundamental checks first, location last. Each gate is
// independent — failing any one denies the clock-in.
export function evaluateClockGate(i: ClockGateInput): ClockGateResult {
  if (i.staffStatus !== "approved") return { ok: false, error: "not_approved" };
  if (!i.enrolled) return { ok: false, error: "not_enrolled" };
  if (i.challengesCount < 2) return { ok: false, error: "liveness_incomplete" };
  if (i.deviceBound && !i.deviceMatches) return { ok: false, error: "device_mismatch" };
  if (i.faceDistance > FACE_MATCH_THRESHOLD) return { ok: false, error: "face_mismatch" };
  if (i.geofenceRequired) {
    if (!i.haveLocation || i.distanceM == null) return { ok: false, error: "no_location" };
    if (i.distanceM > i.radiusM) return { ok: false, error: "outside_geofence" };
  }
  return { ok: true };
}

// Auto in/out: staff never choose direction — the previous record decides. No prior
// record (or last was a clock-out) → this is a clock-in; otherwise a clock-out.
export function nextClockType(lastType: string | null | undefined): "clock_in" | "clock_out" {
  return lastType === "clock_in" ? "clock_out" : "clock_in";
}
