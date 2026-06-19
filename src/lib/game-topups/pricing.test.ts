import { describe, it, expect } from "vitest";
import { computeCustomerPrice, splitTargetIntoPackages, isPriceMoveSuspicious } from "./pricing";

describe("computeCustomerPrice", () => {
  it("applies the discount and rounds to whole pesos (seed catalog)", () => {
    expect(computeCustomerPrice(199, 8)).toBe(183);
    expect(computeCustomerPrice(399, 8)).toBe(367);
    expect(computeCustomerPrice(799, 8)).toBe(735);
    expect(computeCustomerPrice(1399, 8)).toBe(1287);
    expect(computeCustomerPrice(1999, 8)).toBe(1839);
  });
  it("clamps a silly discount and handles bad input", () => {
    expect(computeCustomerPrice(100, 0)).toBe(100);
    expect(computeCustomerPrice(100, 200)).toBe(10); // clamped to 90%
    expect(computeCustomerPrice(100, -50)).toBe(100); // clamped to 0%
    expect(computeCustomerPrice(0, 8)).toBe(0);
    expect(computeCustomerPrice(NaN, 8)).toBe(0);
  });
});

describe("splitTargetIntoPackages", () => {
  const pkgs = [475, 1000, 2050, 3650, 5350];
  it("expresses 2525 as 2050 + 475", () => {
    expect(splitTargetIntoPackages(2525, pkgs)).toEqual([2050, 475]);
  });
  it("returns a single package when exact", () => {
    expect(splitTargetIntoPackages(1000, pkgs)).toEqual([1000]);
  });
  it("returns null when no exact combination exists", () => {
    expect(splitTargetIntoPackages(500, pkgs)).toBeNull();
    expect(splitTargetIntoPackages(0, pkgs)).toBeNull();
  });
});

describe("isPriceMoveSuspicious", () => {
  it("flags moves beyond the threshold", () => {
    expect(isPriceMoveSuspicious(100, 130, 20)).toBe(true); // +30%
    expect(isPriceMoveSuspicious(100, 115, 20)).toBe(false); // +15%
    expect(isPriceMoveSuspicious(100, 75, 20)).toBe(true); // -25%
  });
  it("treats a non-positive new price as suspicious, and no baseline as fine", () => {
    expect(isPriceMoveSuspicious(100, 0, 20)).toBe(true);
    expect(isPriceMoveSuspicious(0, 199, 20)).toBe(false);
  });
});
