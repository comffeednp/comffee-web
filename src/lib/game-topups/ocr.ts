// Screenshot OCR + name-match for Game Top-Ups verification.
//
// extractText() mirrors src/lib/face-quality.ts: Google Vision via raw REST + ?key=, no SDK, with a
// timeout and FAIL-OPEN on any infra error (missing key / non-2xx / timeout) so a Vision outage never
// hard-blocks an order — a definitive name MISMATCH is what fails closed (decided in the OCR route).
//
// normalizeName / levenshtein / matchName are PURE (unit-tested in ocr.test.ts).

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

export interface OcrResult {
  configured: boolean;
  text: string | null; // null = infra error (fail open); "" = ran but read nothing
}

export async function extractText(buffer: Buffer): Promise<OcrResult> {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) return { configured: false, text: null };
  try {
    const res = await fetch(`${VISION_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: buffer.toString("base64") },
            features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { configured: true, text: null };
    const data = await res.json();
    const desc = data?.responses?.[0]?.textAnnotations?.[0]?.description;
    return { configured: true, text: typeof desc === "string" ? desc : "" };
  } catch {
    return { configured: true, text: null };
  }
}

/** Uppercase, strip diacritics + every non-alphanumeric. Collapses a Riot ID and the OCR blob to a
 *  comparable form so spacing / punctuation / case never cause a false miss. */
export function normalizeName(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Classic Levenshtein edit distance (two-row DP). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Does the player's Riot ID appear in the OCR'd screenshot? Tolerant of OCR noise: a direct
 *  substring match, or an edit-distance window match (≤1 for short names, ≤2 for longer). Names
 *  shorter than 3 chars are rejected (too weak to prove account ownership). */
export function matchName(ocrText: string | null, riotId: string): boolean {
  const target = normalizeName(riotId);
  if (target.length < 3) return false;
  const hay = normalizeName(ocrText || "");
  if (!hay) return false;
  if (hay.includes(target)) return true;
  // Fuzzy window match only for longer names. A short name (<6) must match exactly (the substring check
  // above) — otherwise edit-distance 1 false-accepts fixed screenshot words (VALORANT/LEVEL/VP/region).
  if (target.length < 6) return false;
  const tol = 2;
  const lens = [target.length - 1, target.length, target.length + 1].filter((l) => l > 0);
  for (let i = 0; i < hay.length; i++) {
    for (const len of lens) {
      if (i + len > hay.length) continue;
      if (levenshtein(hay.slice(i, i + len), target) <= tol) return true;
    }
  }
  return false;
}
