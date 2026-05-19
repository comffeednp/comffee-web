/**
 * Minimal iCal (RFC 5545) parser focused on what Airbnb sends:
 *   BEGIN:VEVENT
 *   DTSTART;VALUE=DATE:20260415
 *   DTEND;VALUE=DATE:20260418
 *   SUMMARY:Reserved (Airbnb)
 *   UID:abc123@airbnb.com
 *   END:VEVENT
 *
 * We don't need RRULE / TIMEZONE / VALARM support — Airbnb exports are flat.
 * Returns plain {uid, summary, start (YYYY-MM-DD), end (YYYY-MM-DD)} objects.
 */

export interface ParsedICalEvent {
  uid: string;
  summary: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (exclusive — iCal DTEND for all-day events is the next day)
}

/** Unfold continuation lines (lines starting with space or tab join the previous line). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Parse an iCal date value into YYYY-MM-DD */
function parseDateValue(value: string): string | null {
  // All-day form: 20260415
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseICal(text: string): ParsedICalEvent[] {
  const lines = unfold(text);
  const events: ParsedICalEvent[] = [];

  let inEvent = false;
  let cur: Partial<ParsedICalEvent> = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent && cur.uid && cur.start && cur.end) {
        events.push({
          uid: cur.uid,
          summary: cur.summary ?? "",
          start: cur.start,
          end: cur.end,
        });
      }
      inEvent = false;
      cur = {};
      continue;
    }
    if (!inEvent) continue;

    // Split on the first ':' (after stripping params)
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = left.split(";")[0].toUpperCase();

    switch (name) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = value
          .replace(/\\n/g, " ")
          .replace(/\\,/g, ",")
          .replace(/\\;/g, ";");
        break;
      case "DTSTART": {
        const parsed = parseDateValue(value);
        if (parsed) cur.start = parsed;
        break;
      }
      case "DTEND": {
        const parsed = parseDateValue(value);
        if (parsed) cur.end = parsed;
        break;
      }
    }
  }

  return events;
}

/** Build a minimal iCal feed from a list of reservations. Used for our export endpoint. */
export interface ICalEventInput {
  uid: string;
  summary: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (exclusive)
}

export function buildICal(calendarName: string, events: ICalEventInput[]): string {
  const dt = (s: string) => s.replaceAll("-", "");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Comffee Drink and Play//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${calendarName}`,
  ];
  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dt(ev.start)}`);
    lines.push(`DTEND;VALUE=DATE:${dt(ev.end)}`);
    lines.push(`SUMMARY:${ev.summary}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // Per spec, lines longer than 75 octets should be folded — for our short
  // summaries we don't bother, but newlines must be CRLF.
  return lines.join("\r\n") + "\r\n";
}
