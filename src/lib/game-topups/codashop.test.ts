import { describe, it, expect } from "vitest";
import { parseCodashopVpPrices } from "./codashop";

// Mirrors the real Codashop page: VP labels and ₱ prices appear as separate, complete lists (not paired
// in the DOM). We pair by sorted order behind a confidence gate.
const realisticHtml = `
  <div>475 VP</div> ... <div>1,000 VP</div> ... <div>2050 VP</div>
  <div>3650 VP</div> ... <div>5350 VP</div> ... <div>11000 VP</div>
  ...elsewhere... ₱199 ... ₱399 ... ₱799 ... ₱1,399 ... ₱1,999 ... ₱3,999 ...
`;

describe("parseCodashopVpPrices", () => {
  it("pairs VP denominations to ₱ prices by sorted order", () => {
    expect(parseCodashopVpPrices(realisticHtml)).toEqual({
      475: 199,
      1000: 399,
      2050: 799,
      3650: 1399,
      5350: 1999,
      11000: 3999,
    });
  });

  it("returns null when the counts don't match (a stray ₱ appears)", () => {
    expect(parseCodashopVpPrices("475 VP 1000 VP ₱199 ₱399 ₱9 sale")).toBeNull();
  });

  it("returns null when a pairing is implausible (out of the per-VP band)", () => {
    expect(parseCodashopVpPrices("475 VP 1000 VP ₱5000 ₱9000")).toBeNull();
  });

  it("returns null on empty / no data", () => {
    expect(parseCodashopVpPrices("")).toBeNull();
    expect(parseCodashopVpPrices("no prices here at all")).toBeNull();
  });
});
