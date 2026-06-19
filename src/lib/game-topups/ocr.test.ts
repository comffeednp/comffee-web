import { describe, it, expect } from "vitest";
import { normalizeName, levenshtein, matchName } from "./ocr";

describe("normalizeName", () => {
  it("uppercases and strips spacing/punctuation/diacritics", () => {
    expect(normalizeName("West bourne")).toBe("WESTBOURNE");
    expect(normalizeName("José_99")).toBe("JOSE99");
    expect(normalizeName("a.b-c d")).toBe("ABCD");
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("matchName", () => {
  const ocr = "VALORANT\nWestbourne #SEA\nLevel 142\n2050 VP";
  it("matches the in-game name within the screenshot text", () => {
    expect(matchName(ocr, "Westbourne")).toBe(true);
  });
  it("tolerates a small OCR typo", () => {
    expect(matchName("Profile: Westboume", "Westbourne")).toBe(true); // rn -> m misread
  });
  it("rejects an unrelated name", () => {
    expect(matchName(ocr, "TotallyDifferent")).toBe(false);
  });
  it("rejects too-short targets and empty OCR", () => {
    expect(matchName(ocr, "ab")).toBe(false);
    expect(matchName(null, "Westbourne")).toBe(false);
    expect(matchName("", "Westbourne")).toBe(false);
  });
});
