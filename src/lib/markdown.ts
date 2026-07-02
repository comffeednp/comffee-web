import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Markdown → SANITIZED HTML for owner/partner-supplied rich text that pages render with
// dangerouslySetInnerHTML. marked does NOT sanitize — raw HTML blocks and javascript: hrefs
// pass straight through — and the site CSP has no script-src yet, so partner-submitted
// description_md was a stored-XSS vector on the public branch pages (audit 2026-07-02).
//
// Sanitizer is sanitize-html, NOT isomorphic-dompurify: DOMPurify needs a server DOM (jsdom),
// and jsdom is externalized by Next/Turbopack then require()d at runtime in the Vercel lambda,
// where its ESM-only transitive deps crash module load (ERR_REQUIRE_ESM via
// html-encoding-sniffer → @exodus/bytes) — which 500'd every /branches/[slug] and
// /partners/[slug] render in production (incident 2026-07-02). sanitize-html is pure JS,
// no DOM required, safe in serverless.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  // Defaults cover marked's output except h1/h2 and img; description photos are legitimate.
  allowedTags: [...sanitizeHtml.defaults.allowedTags, "h1", "h2", "img"],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "title"],
  },
  // http(s)/mailto/tel only — drops javascript:, data:, etc.
  allowedSchemes: ["http", "https", "mailto", "tel"],
};

export function mdToSafeHtml(md: string): string {
  return sanitizeHtml(marked(md) as string, SANITIZE_OPTIONS);
}
