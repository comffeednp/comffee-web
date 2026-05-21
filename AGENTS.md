<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Rule: Every interactive element must have a hover description

Every `<button>`, `<Link>`, and `<a>` element in this project MUST have a `title` attribute describing what it does.
- Elements that already have `aria-label` are exempt (skip those).
- This applies to ALL new code you write. Never add a button or link without a `title`.
- If you modify a file, check all its buttons/links for missing titles and add them.
- Title text should be concise and action-oriented: "Cancel booking", "Go to account", "Upload photo", etc.
