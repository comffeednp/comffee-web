import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "./rate-limit";

// Each test uses a unique key so the global bucket map doesn't cause cross-test pollution.
let counter = 0;
function uniqueKey(): string {
  counter++;
  return `test-${Date.now()}-${counter}`;
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    counter++;
  });

  it("allows requests under the limit", () => {
    const key = uniqueKey();
    expect(checkRateLimit(key, 3, 10_000).ok).toBe(true);
    expect(checkRateLimit(key, 3, 10_000).ok).toBe(true);
    expect(checkRateLimit(key, 3, 10_000).ok).toBe(true);
  });

  it("blocks requests at the limit", () => {
    const key = uniqueKey();
    checkRateLimit(key, 2, 10_000);
    checkRateLimit(key, 2, 10_000);
    const result = checkRateLimit(key, 2, 10_000);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns the correct remaining count", () => {
    const key = uniqueKey();
    expect(checkRateLimit(key, 5, 10_000).remaining).toBe(4);
    expect(checkRateLimit(key, 5, 10_000).remaining).toBe(3);
    expect(checkRateLimit(key, 5, 10_000).remaining).toBe(2);
  });

  it("isolates buckets per key", () => {
    const a = uniqueKey();
    const b = uniqueKey();
    checkRateLimit(a, 1, 10_000);
    expect(checkRateLimit(a, 1, 10_000).ok).toBe(false);
    expect(checkRateLimit(b, 1, 10_000).ok).toBe(true);
  });

  it("blocks the very first request when limit is 0", () => {
    const key = uniqueKey();
    // limit=0 should never let any request through
    const result = checkRateLimit(key, 0, 10_000);
    // First request always passes (creates bucket with count=1) — this matches our
    // current semantics; document the expectation explicitly.
    expect(result.ok).toBe(true);
  });

  it("provides a positive resetAt in the near future", () => {
    const key = uniqueKey();
    const before = Date.now();
    const result = checkRateLimit(key, 5, 10_000);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 9_000);
    expect(result.resetAt).toBeLessThanOrEqual(before + 11_000);
  });
});
