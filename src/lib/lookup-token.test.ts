import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signChatSessionToken } from "./lookup-token";

// The booking-thread contract: webhook (server) and confirmed page (guest
// browser) must derive the SAME token for one reservation so they converge on
// one conversation, and the token must pass /api/chat/start's 16–64 length gate.
describe("signChatSessionToken", () => {
  const saved = {
    lookup: process.env.LOOKUP_SIGNING_SECRET,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  beforeEach(() => {
    process.env.LOOKUP_SIGNING_SECRET = "test-lookup-secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });
  afterEach(() => {
    if (saved.lookup === undefined) delete process.env.LOOKUP_SIGNING_SECRET;
    else process.env.LOOKUP_SIGNING_SECRET = saved.lookup;
    if (saved.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
  });

  it("is deterministic per reservation and distinct across reservations", () => {
    const a1 = signChatSessionToken("11111111-aaaa-bbbb-cccc-000000000001");
    const a2 = signChatSessionToken("11111111-aaaa-bbbb-cccc-000000000001");
    const b = signChatSessionToken("11111111-aaaa-bbbb-cccc-000000000002");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it("fits /api/chat/start's session-token gate (16–64 base64url chars)", () => {
    const t = signChatSessionToken("11111111-aaaa-bbbb-cccc-000000000001");
    expect(t.length).toBeGreaterThanOrEqual(16);
    expect(t.length).toBeLessThanOrEqual(64);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("falls back to the service key when LOOKUP_SIGNING_SECRET is unset", () => {
    const withLookup = signChatSessionToken("res-1");
    delete process.env.LOOKUP_SIGNING_SECRET;
    const withService = signChatSessionToken("res-1");
    expect(withService).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(withService).not.toBe(withLookup);
  });

  it("returns empty string when no secret exists at all (fail closed)", () => {
    delete process.env.LOOKUP_SIGNING_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(signChatSessionToken("res-1")).toBe("");
  });
});
