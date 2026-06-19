// Pure parsers for Codashop delivery confirmations — the inbound receipt EMAIL (primary) and the
// MacroDroid SMS fallback. They extract { riotId, tag, vp, ref } so the matcher can tick the right
// order line and dedupe on the reference.
//
// ⚠ TUNE THESE once a real Codashop receipt email + a real OTP/success SMS are supplied (design doc
// §19, items 2-3). The defaults target the common Codashop layout but the exact wording/labels vary.

export interface ParsedConfirmation {
  riotId: string | null;
  tag: string | null;
  vp: number | null;
  ref: string | null;
}

/** First "<number> VP / Points" occurrence (commas allowed, e.g. "2,050 VP"). */
export function parseVp(text: string): number | null {
  const m = (text || "").match(/([\d,]{2,9})\s*(?:VP|valorant\s*points?|RP|riot\s*points?|points?)\b/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A Riot ID, preferring the "Name#TAG" form; falling back to a labelled line. */
export function parseRiotId(text: string): { id: string | null; tag: string | null } {
  // Name token immediately before the #tag. No spaces in this capture, or it greedily swallows the
  // preceding words ("475 VP sent to LunaStar"); the matcher normalises both sides so a spaced Riot
  // name still matches by substring.
  const hash = (text || "").match(/([A-Za-z0-9][A-Za-z0-9._-]{1,30})#([A-Za-z0-9]{2,8})/);
  if (hash) return { id: hash[1].trim(), tag: hash[2].trim() };
  const lbl = (text || "").match(
    /(?:riot\s*id|user\s*(?:id|name)|player|account|in[-\s]?game\s*name)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9 ._-]{1,31})/i,
  );
  return { id: lbl ? lbl[1].trim() : null, tag: null };
}

/** The Codashop order / reference / transaction number used to dedupe confirmations. */
export function parseRef(text: string): string | null {
  // Specific labels allow an optional separator; the bare "ref" requires a word boundary AND a separator
  // so it doesn't match inside "Refund" / "preference" and capture a spurious token.
  const m = (text || "").match(
    /(?:(?:order\s*(?:no|number|id)|reference(?:\s*(?:no|number))?|transaction\s*(?:id|no)|invoice)\s*[:#-]?\s*|\bref\b\s*[:#-]?\s*)([A-Za-z0-9][A-Za-z0-9-]{3,39})/i,
  );
  return m ? m[1].trim() : null;
}

export function parseCodashopEmail(body: string): ParsedConfirmation {
  const { id, tag } = parseRiotId(body);
  return { riotId: id, tag, vp: parseVp(body), ref: parseRef(body) };
}

export function parseSmsConfirmation(text: string): ParsedConfirmation {
  const { id, tag } = parseRiotId(text);
  return { riotId: id, tag, vp: parseVp(text), ref: parseRef(text) };
}
