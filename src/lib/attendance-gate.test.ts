import { describe, it, expect } from "vitest";
import { evaluateClockGate, nextClockType, type ClockGateInput } from "./attendance-gate";
import { FACE_MATCH_THRESHOLD } from "./face-match";

// A fully-passing clock-in. Each test flips ONE thing to prove that gate.
function ok(): ClockGateInput {
  return {
    staffStatus: "approved",
    enrolled: true,
    challengesCount: 2,
    deviceBound: true,
    deviceMatches: true,
    faceDistance: 0.2,
    geofenceRequired: true,
    haveLocation: true,
    distanceM: 30,
    radiusM: 100,
  };
}

describe("evaluateClockGate — happy path", () => {
  it("allows a fully-valid clock-in", () => {
    expect(evaluateClockGate(ok())).toEqual({ ok: true });
  });
  it("allows when geofence is OFF even if far away", () => {
    expect(evaluateClockGate({ ...ok(), geofenceRequired: false, distanceM: 9999 }))
      .toEqual({ ok: true });
  });
  it("allows when no device is bound yet (first clock-in binds)", () => {
    expect(evaluateClockGate({ ...ok(), deviceBound: false, deviceMatches: false }))
      .toEqual({ ok: true });
  });
});

describe("evaluateClockGate — each denial branch", () => {
  const cases: Array<[string, Partial<ClockGateInput>, string]> = [
    ["pending staff", { staffStatus: "pending" }, "not_approved"],
    ["rejected staff", { staffStatus: "rejected" }, "not_approved"],
    ["disabled staff", { staffStatus: "disabled" }, "not_approved"],
    ["not enrolled", { enrolled: false }, "not_enrolled"],
    ["liveness incomplete", { challengesCount: 1 }, "liveness_incomplete"],
    ["different phone", { deviceMatches: false }, "device_mismatch"],
    ["face too far", { faceDistance: 0.99 }, "face_mismatch"],
    ["no GPS when required", { haveLocation: false, distanceM: null }, "no_location"],
    ["outside radius", { distanceM: 250 }, "outside_geofence"],
  ];
  for (const [name, patch, error] of cases) {
    it(`denies: ${name} → ${error}`, () => {
      expect(evaluateClockGate({ ...ok(), ...patch })).toEqual({ ok: false, error });
    });
  }
});

describe("LOOP: clock in/out alternates correctly over many cycles", () => {
  it("strictly alternates starting from no record", () => {
    let last: "clock_in" | "clock_out" | null = null;
    const seq: string[] = [];
    for (let i = 0; i < 200; i++) {
      const next = nextClockType(last);
      seq.push(next);
      // never two of the same in a row
      if (i > 0) expect(next).not.toBe(seq[i - 1]);
      last = next;
    }
    expect(seq[0]).toBe("clock_in"); // first ever = clock in
    expect(seq[1]).toBe("clock_out");
    // 200 alternating → exactly 100 in / 100 out
    expect(seq.filter((s) => s === "clock_in").length).toBe(100);
  });

  it("a forgotten clock-out (last was clock_in) → next is clock_out", () => {
    expect(nextClockType("clock_in")).toBe("clock_out");
  });
  it("after a clock_out, next is a fresh clock_in", () => {
    expect(nextClockType("clock_out")).toBe("clock_in");
  });
});

describe("LOOP: face-distance sweep around the match threshold", () => {
  it("accepts at/below threshold, rejects above — across the whole range", () => {
    for (let d = 0; d <= 1.0001; d += 0.01) {
      const dist = Math.round(d * 1000) / 1000;
      const res = evaluateClockGate({ ...ok(), faceDistance: dist });
      if (dist <= FACE_MATCH_THRESHOLD) {
        expect(res, `dist ${dist} should pass`).toEqual({ ok: true });
      } else {
        expect(res, `dist ${dist} should fail`).toEqual({ ok: false, error: "face_mismatch" });
      }
    }
  });
});

describe("LOOP: geofence distance sweep around the radius", () => {
  it("allows within radius, blocks beyond — for many radii", () => {
    for (const radius of [50, 100, 150, 300]) {
      for (let dist = 0; dist <= radius + 50; dist += 10) {
        const res = evaluateClockGate({ ...ok(), radiusM: radius, distanceM: dist });
        if (dist <= radius) expect(res).toEqual({ ok: true });
        else expect(res).toEqual({ ok: false, error: "outside_geofence" });
      }
    }
  });
});

describe("FLOWCHART WALK: a new staff from sign-in to a full shift", () => {
  it("denies at each stage until fully set up, then clocks a full in→out shift", () => {
    // 1. Just signed in (pending, no face) — denied.
    let s = { ...ok(), staffStatus: "pending", enrolled: false, deviceBound: false, deviceMatches: false };
    expect(evaluateClockGate(s)).toEqual({ ok: false, error: "not_approved" });

    // 2. Admin approves, but face not enrolled yet — denied.
    s = { ...s, staffStatus: "approved" };
    expect(evaluateClockGate(s)).toEqual({ ok: false, error: "not_enrolled" });

    // 3. Enrolled, on-site, first phone (nothing bound yet) — ALLOWED → this binds the phone.
    s = { ...s, enrolled: true };
    expect(evaluateClockGate(s)).toEqual({ ok: true });

    // 4. Now bound to that phone. Same phone, inside radius — clock IN allowed.
    s = { ...s, deviceBound: true, deviceMatches: true };
    expect(evaluateClockGate(s)).toEqual({ ok: true });
    const inType = nextClockType(null);
    expect(inType).toBe("clock_in");

    // 5. Tries from a DIFFERENT phone — blocked.
    expect(evaluateClockGate({ ...s, deviceMatches: false })).toEqual({ ok: false, error: "device_mismatch" });

    // 6. Wanders outside the area for clock-out — blocked until back inside.
    expect(evaluateClockGate({ ...s, distanceM: 500 })).toEqual({ ok: false, error: "outside_geofence" });

    // 7. Back inside → clock OUT allowed, and direction flips from the last (clock_in).
    expect(evaluateClockGate(s)).toEqual({ ok: true });
    expect(nextClockType(inType)).toBe("clock_out");
  });
});
