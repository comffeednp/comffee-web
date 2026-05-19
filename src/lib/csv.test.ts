import { describe, it, expect } from "vitest";
import { toCsv, csvFilename } from "./csv";

describe("toCsv", () => {
  it("writes a header row + data rows", () => {
    const csv = toCsv(
      [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ],
      [
        { key: "name", label: "Name" },
        { key: "age", label: "Age" },
      ],
    );
    expect(csv).toContain("Name,Age");
    expect(csv).toContain("Alice,30");
    expect(csv).toContain("Bob,25");
  });

  it("starts with a UTF-8 BOM", () => {
    const csv = toCsv([{ a: "x" }], [{ key: "a", label: "A" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("escapes commas in cell values", () => {
    const csv = toCsv(
      [{ note: "hello, world" }],
      [{ key: "note", label: "Note" }],
    );
    expect(csv).toContain('"hello, world"');
  });

  it("escapes embedded double quotes by doubling", () => {
    const csv = toCsv(
      [{ s: 'she said "hi"' }],
      [{ key: "s", label: "S" }],
    );
    expect(csv).toContain('"she said ""hi"""');
  });

  it("escapes embedded newlines", () => {
    const csv = toCsv(
      [{ s: "line1\nline2" }],
      [{ key: "s", label: "S" }],
    );
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null and undefined as empty strings", () => {
    const csv = toCsv(
      [{ a: null, b: undefined, c: "x" }],
      [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "c", label: "C" },
      ],
    );
    expect(csv).toContain(",,x");
  });

  it("uses CRLF line endings", () => {
    const csv = toCsv([{ a: "x" }], [{ key: "a", label: "A" }]);
    expect(csv).toContain("\r\n");
  });
});

describe("csvFilename", () => {
  it("includes the entity name and a date", () => {
    const name = csvFilename("orders");
    expect(name).toMatch(/^comffe-orders-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
