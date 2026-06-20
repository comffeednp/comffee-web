import { describe, it, expect } from "vitest";
import { parseCodashopPrices } from "./codashop";

// Codashop renders each product card's amount 2-3× consecutively then its ₱ price. We CO-LOCATE on that:
// pair a price only with an amount that was just repeated ≥2× right before it. Summary quick-lists (each
// amount once, then a run of prices) and pass/bonus rows (an amount with no price after) are ignored.
describe("parseCodashopPrices", () => {
  it("co-locates each card's amount with the price right after it", () => {
    const html = `
      475 VP 475 VP 475 VP ₱199
      1,000 VP 1000 VP 1000 VP ₱399
      2050 VP 2050 VP ₱799
    `;
    expect(parseCodashopPrices(html, "VP")).toEqual({ 475: 199, 1000: 399, 2050: 799 });
  });

  it("works for any currency label, not just VP", () => {
    const html = `425 Wild Cores 425 Wild Cores ₱200  1000 Wild Cores 1000 Wild Cores ₱449`;
    expect(parseCodashopPrices(html, "Wild Cores")).toEqual({ 425: 200, 1000: 449 });
  });

  it("ignores a summary list (each amount once, then a run of prices)", () => {
    expect(parseCodashopPrices("60 GC 330 GC 1090 GC ₱55 ₱280 ₱830", "GC")).toBeNull();
  });

  it("reads the real grid even when a summary list precedes it", () => {
    const html = `
      60 GC 330 GC 1090 GC ₱55 ₱280 ₱830
      60 GC 60 GC ₱55   330 GC 330 GC ₱280   1090 GC 1090 GC ₱830
    `;
    expect(parseCodashopPrices(html, "GC")).toEqual({ 60: 55, 330: 280, 1090: 830 });
  });

  it("ignores pass/bonus rows (an amount with no price right after)", () => {
    const html = `590 Cores 590 Cores  380 Cores 380 Cores  425 Cores 425 Cores ₱200  1000 Cores 1000 Cores ₱449`;
    expect(parseCodashopPrices(html, "Cores")).toEqual({ 425: 200, 1000: 449 });
  });

  it("returns null on an implausible price-per-unit", () => {
    expect(parseCodashopPrices("475 VP 475 VP ₱5  1000 VP 1000 VP ₱9", "VP")).toBeNull();
  });

  it("returns null when the result isn't monotonic (a mis-pair)", () => {
    expect(parseCodashopPrices("475 VP 475 VP ₱500  1000 VP 1000 VP ₱200", "VP")).toBeNull();
  });

  it("returns null on empty / no data", () => {
    expect(parseCodashopPrices("", "VP")).toBeNull();
    expect(parseCodashopPrices("no prices here at all", "VP")).toBeNull();
  });
});
