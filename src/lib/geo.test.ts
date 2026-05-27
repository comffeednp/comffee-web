import { describe, it, expect } from "vitest";
import { haversineMeters } from "./geo";

describe("haversineMeters", () => {
  it("is 0 for the same point", () => {
    expect(haversineMeters(14.6, 121.0, 14.6, 121.0)).toBe(0);
  });

  it("matches a known short distance (~111m per 0.001° latitude)", () => {
    const d = haversineMeters(14.6, 121.0, 14.601, 121.0);
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(114);
  });

  it("is symmetric", () => {
    const a = haversineMeters(14.6, 121.0, 14.65, 121.05);
    const b = haversineMeters(14.65, 121.05, 14.6, 121.0);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });
});
