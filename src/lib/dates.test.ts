import { describe, it, expect } from "vitest";
import {
  toDateString,
  fromDateString,
  nightsBetween,
  addDays,
  formatRange,
} from "./dates";

describe("toDateString / fromDateString", () => {
  it("formats a date as YYYY-MM-DD", () => {
    const d = new Date(2026, 3, 15); // April 15, 2026 (local)
    expect(toDateString(d)).toBe("2026-04-15");
  });

  it("zero-pads month and day", () => {
    const d = new Date(2026, 0, 5);
    expect(toDateString(d)).toBe("2026-01-05");
  });

  it("round-trips through fromDateString", () => {
    const original = "2026-07-20";
    const d = fromDateString(original);
    expect(toDateString(d)).toBe(original);
  });
});

describe("nightsBetween", () => {
  it("computes simple ranges", () => {
    expect(nightsBetween("2026-04-15", "2026-04-18")).toBe(3);
    expect(nightsBetween("2026-04-15", "2026-04-16")).toBe(1);
  });

  it("returns 0 for same-day or invalid ranges", () => {
    expect(nightsBetween("2026-04-15", "2026-04-15")).toBe(0);
    expect(nightsBetween("2026-04-18", "2026-04-15")).toBe(0);
  });

  it("handles month boundaries", () => {
    expect(nightsBetween("2026-04-30", "2026-05-02")).toBe(2);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-04-15", 1)).toBe("2026-04-16");
    expect(addDays("2026-04-15", 7)).toBe("2026-04-22");
  });

  it("crosses month boundaries", () => {
    expect(addDays("2026-04-30", 2)).toBe("2026-05-02");
  });

  it("crosses year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("formatRange", () => {
  it("includes year in the second date", () => {
    const out = formatRange("2026-04-15", "2026-04-18");
    expect(out).toContain("2026");
    expect(out).toContain("→");
  });

  it("includes year in both dates when years differ", () => {
    const out = formatRange("2026-12-30", "2027-01-02");
    expect(out).toContain("2026");
    expect(out).toContain("2027");
  });
});
