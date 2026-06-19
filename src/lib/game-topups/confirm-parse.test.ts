import { describe, it, expect } from "vitest";
import { parseVp, parseRiotId, parseRef, parseCodashopEmail, parseSmsConfirmation } from "./confirm-parse";

describe("parseVp", () => {
  it("reads a VP amount with or without commas", () => {
    expect(parseVp("You received 2050 VP")).toBe(2050);
    expect(parseVp("Top up of 2,050 VP successful")).toBe(2050);
    expect(parseVp("475 Valorant Points")).toBe(475);
  });
  it("returns null when absent", () => {
    expect(parseVp("payment received")).toBeNull();
  });
});

describe("parseRiotId", () => {
  it("prefers the Name#TAG form", () => {
    expect(parseRiotId("Delivered to Westbourne#SEA")).toEqual({ id: "Westbourne", tag: "SEA" });
  });
  it("falls back to a labelled line", () => {
    expect(parseRiotId("Riot ID: CoolGamer")).toEqual({ id: "CoolGamer", tag: null });
  });
});

describe("parseRef", () => {
  it("reads an order / reference number", () => {
    expect(parseRef("Order No: CODA-123456")).toBe("CODA-123456");
    expect(parseRef("Reference Number 998877")).toBe("998877");
  });
  it("returns null when absent", () => {
    expect(parseRef("thanks for your purchase")).toBeNull();
  });
});

describe("parse confirmations end to end", () => {
  const email =
    "Codashop\nYour purchase of 2050 VP for Valorant was successful.\nRiot ID: Westbourne#SEA\nOrder No: CODA-778899\nThank you!";
  it("parses an email receipt", () => {
    expect(parseCodashopEmail(email)).toEqual({ riotId: "Westbourne", tag: "SEA", vp: 2050, ref: "CODA-778899" });
  });
  it("parses an SMS line", () => {
    expect(parseSmsConfirmation("Success! 475 VP sent to LunaStar#1234 ref 55667788")).toEqual({
      riotId: "LunaStar",
      tag: "1234",
      vp: 475,
      ref: "55667788",
    });
  });
});
