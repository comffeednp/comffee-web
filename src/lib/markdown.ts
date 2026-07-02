import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

// Markdown → SANITIZED HTML for owner/partner-supplied rich text that pages render with
// dangerouslySetInnerHTML. marked does NOT sanitize — raw HTML blocks and javascript: hrefs
// pass straight through — and the site CSP has no script-src yet, so partner-submitted
// description_md was a stored-XSS vector on the public branch pages (audit 2026-07-02):
// any licensed cafe could ship <script> that ran for every visitor, including a signed-in
// admin. DOMPurify strips scripts/event handlers/dangerous URLs while keeping normal
// formatting (headings, bold, lists, links).
export function mdToSafeHtml(md: string): string {
  return DOMPurify.sanitize(marked(md) as string);
}
