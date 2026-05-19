/**
 * Tiny CSV serializer — no dep. Handles quoting, embedded commas/quotes/newlines.
 * Compatible with Excel, Google Sheets, Numbers.
 */

export type CsvCell = string | number | boolean | null | undefined | Date;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, CsvCell>>(
  rows: T[],
  columns: Array<{ key: keyof T; label: string }>,
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key])).join(","),
  );
  // BOM so Excel detects UTF-8 correctly
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}

export function csvFilename(name: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `comffe-${name}-${stamp}.csv`;
}
