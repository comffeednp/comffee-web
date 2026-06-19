import { describe, it, expect } from "vitest";
import { canTransition, isTerminal, isOpenForFulfilment } from "./state";

describe("canTransition", () => {
  it("allows the happy path", () => {
    expect(canTransition("draft", "verified")).toBe(true);
    expect(canTransition("verified", "pending")).toBe(true);
    expect(canTransition("pending", "processing")).toBe(true);
    expect(canTransition("processing", "delivered")).toBe(true);
  });
  it("allows failure / refund branches", () => {
    expect(canTransition("pending", "refunded")).toBe(true);
    expect(canTransition("processing", "failed")).toBe(true);
    expect(canTransition("failed", "refunded")).toBe(true);
  });
  it("rejects illegal jumps and exits from terminal states", () => {
    expect(canTransition("draft", "delivered")).toBe(false);
    expect(canTransition("verified", "delivered")).toBe(false);
    expect(canTransition("delivered", "refunded")).toBe(false);
    expect(canTransition("refunded", "pending")).toBe(false);
  });
});

describe("status predicates", () => {
  it("isTerminal", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("refunded")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
  });
  it("isOpenForFulfilment", () => {
    expect(isOpenForFulfilment("pending")).toBe(true);
    expect(isOpenForFulfilment("processing")).toBe(true);
    expect(isOpenForFulfilment("verified")).toBe(false);
    expect(isOpenForFulfilment("delivered")).toBe(false);
  });
});
