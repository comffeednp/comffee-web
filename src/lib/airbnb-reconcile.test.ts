import { describe, it, expect } from "vitest";
import { planCancellations, type ExistingNight } from "./airbnb-reconcile";

const confirmed = (uid: string): ExistingNight => ({ ical_uid: uid, status: "confirmed" });
const feed = (...uids: string[]) => new Set(uids);

describe("planCancellations — glitch guard", () => {
  it("treats an empty feed (after a good run) as a glitch and frees nothing", () => {
    const plan = planCancellations(feed(), [confirmed("a"), confirmed("b")], [], 2, 0);
    expect(plan.glitch).toBe(true);
    expect(plan.toCancel).toEqual([]);
    expect(plan.nextMissing).toEqual([]); // miss list preserved, not advanced
    expect(plan.nextCount).toBeNull(); // baseline left untouched
  });

  it("treats a >50% smaller feed as a glitch", () => {
    const existing = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map(confirmed);
    const plan = planCancellations(feed("a", "b", "c"), existing, [], 9, 3); // 3 < 4.5
    expect(plan.glitch).toBe(true);
    expect(plan.toCancel).toEqual([]);
  });

  it("does NOT glitch on the first-ever run (no baseline yet)", () => {
    const plan = planCancellations(feed(), [], [], null, 0);
    expect(plan.glitch).toBe(false);
    expect(plan.nextCount).toBe(0);
  });

  it("does NOT glitch on a modest drop", () => {
    const existing = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map(confirmed);
    const plan = planCancellations(feed("a", "b", "c", "d", "e", "f", "g", "h"), existing, [], 9, 8);
    expect(plan.glitch).toBe(false);
  });
});

describe("planCancellations — 2-check debounce", () => {
  it("carries a first-time miss forward instead of freeing it", () => {
    const plan = planCancellations(feed("a"), [confirmed("a"), confirmed("b")], [], 2, 1);
    expect(plan.toCancel).toEqual([]); // b missing once — not yet
    expect(plan.nextMissing).toEqual(["b"]);
    expect(plan.nextCount).toBe(1);
  });

  it("frees a night missing on two consecutive runs", () => {
    const plan = planCancellations(feed("a"), [confirmed("a"), confirmed("b")], ["b"], 2, 1);
    expect(plan.toCancel).toEqual(["b"]); // missing now AND last run
    expect(plan.nextMissing).toEqual([]);
  });

  it("clears the miss when a night returns to the feed", () => {
    const plan = planCancellations(feed("a", "b"), [confirmed("a"), confirmed("b")], ["b"], 2, 2);
    expect(plan.toCancel).toEqual([]);
    expect(plan.nextMissing).toEqual([]); // b is back — no longer pending
  });
});

describe("planCancellations — already-cancelled nights", () => {
  it("ignores cancelled rows (never re-cancels, never counts them missing)", () => {
    const existing: ExistingNight[] = [
      { ical_uid: "a", status: "confirmed" },
      { ical_uid: "gone", status: "cancelled" },
    ];
    const plan = planCancellations(feed("a"), existing, [], 1, 1);
    expect(plan.toCancel).toEqual([]);
    expect(plan.nextMissing).toEqual([]);
  });
});

describe("planCancellations — healthy run", () => {
  it("frees nothing when every night is present", () => {
    const plan = planCancellations(feed("a", "b"), [confirmed("a"), confirmed("b")], [], 2, 2);
    expect(plan.glitch).toBe(false);
    expect(plan.toCancel).toEqual([]);
    expect(plan.nextMissing).toEqual([]);
    expect(plan.nextCount).toBe(2);
  });
});
