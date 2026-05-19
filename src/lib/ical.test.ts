import { describe, it, expect } from "vitest";
import { parseICal, buildICal } from "./ical";

describe("parseICal", () => {
  it("parses a single all-day event", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:abc123@airbnb.com",
      "DTSTART;VALUE=DATE:20260415",
      "DTEND;VALUE=DATE:20260418",
      "SUMMARY:Reserved (Airbnb)",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseICal(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      uid: "abc123@airbnb.com",
      summary: "Reserved (Airbnb)",
      start: "2026-04-15",
      end: "2026-04-18",
    });
  });

  it("parses multiple events in one feed", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:1@x",
      "DTSTART;VALUE=DATE:20260101",
      "DTEND;VALUE=DATE:20260102",
      "SUMMARY:One",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:2@x",
      "DTSTART;VALUE=DATE:20260201",
      "DTEND;VALUE=DATE:20260203",
      "SUMMARY:Two",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseICal(text);
    expect(events).toHaveLength(2);
    expect(events[0].uid).toBe("1@x");
    expect(events[1].uid).toBe("2@x");
    expect(events[1].end).toBe("2026-02-03");
  });

  it("skips events missing required fields", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:incomplete@x",
      "DTSTART;VALUE=DATE:20260101",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICal(text)).toHaveLength(0);
  });

  it("handles unfolded continuation lines", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:long@x",
      "DTSTART;VALUE=DATE:20260101",
      "DTEND;VALUE=DATE:20260102",
      "SUMMARY:This summary is split",
      " across two lines",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseICal(text);
    expect(events[0].summary).toBe("This summary is splitacross two lines");
  });

  it("returns empty array for invalid input", () => {
    expect(parseICal("")).toEqual([]);
    expect(parseICal("not a calendar")).toEqual([]);
  });
});

describe("buildICal", () => {
  it("emits a valid VCALENDAR with all events", () => {
    const out = buildICal("Test Calendar", [
      { uid: "x@1", summary: "Booking", start: "2026-04-15", end: "2026-04-18" },
    ]);
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("END:VCALENDAR");
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain("END:VEVENT");
    expect(out).toContain("UID:x@1");
    expect(out).toContain("DTSTART;VALUE=DATE:20260415");
    expect(out).toContain("DTEND;VALUE=DATE:20260418");
    expect(out).toContain("SUMMARY:Booking");
    expect(out).toContain("X-WR-CALNAME:Test Calendar");
  });

  it("uses CRLF line endings (per RFC 5545)", () => {
    const out = buildICal("X", [
      { uid: "u@1", summary: "S", start: "2026-01-01", end: "2026-01-02" },
    ]);
    expect(out).toContain("\r\n");
  });

  it("round-trips through parseICal", () => {
    const events = [
      { uid: "rt@1", summary: "Round trip", start: "2026-05-10", end: "2026-05-12" },
    ];
    const ics = buildICal("RT", events);
    const parsed = parseICal(ics);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].uid).toBe("rt@1");
    expect(parsed[0].start).toBe("2026-05-10");
    expect(parsed[0].end).toBe("2026-05-12");
  });
});
