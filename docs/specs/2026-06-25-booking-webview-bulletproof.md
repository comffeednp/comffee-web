# Spec — Make the booking flow bulletproof (in-app-browser / Google OAuth block)

Date: 2026-06-25. Repo: comffee-web (Next.js 16, Supabase SSR). Owner-approved.
Urgency: PRODUCTION — a customer at "Comffee Anonas" could not book (screenshot: Google
"Error 403: disallowed_useragent").

## Root cause (verified)
The reserve-pc booking gate (`src/app/(site)/branches/[slug]/reserve-pc/page.tsx:83-102`) shows a
logged-out customer ONLY a single "Sign in with your Google account" button — no email option.
Google blocks OAuth inside embedded in-app browsers (Messenger/Facebook/Instagram/etc.) with
`disallowed_useragent` ("Use secure browsers" policy). Most Comffee traffic arrives via Messenger
links, so tapping a booking link in Messenger → Google wall → dead end. No webview detection exists.
The `/account/login` page already has BOTH Google + email/password + `next` support — the booking gate
just doesn't use it.

## Fix (approved: open-in-browser guidance + email fallback)
1. **Webview detection util** `src/lib/in-app-browser.ts`: `isInAppBrowser(ua)` → `{inApp, name}`.
   Detect FBAN/FBAV (Facebook/Messenger), Instagram, Line, TikTok, Snapchat, etc. SSR-friendly
   (called with the `user-agent` header) so there's no client flash; also export a tiny client helper.
2. **`WebviewNotice` component**: a clear banner — "You're in <App>'s in-app browser. Tap ⋯ → Open in
   Chrome/Safari to sign in with Google" + a "Copy link" button (so they can paste into a real browser).
   Render on the booking gate AND `/account/login`. (All buttons/links get a `title` per AGENTS.md.)
3. **Email path on the booking gate**: a logged-out customer gets, in addition to Google, an email
   sign-in (reuse `memberLoginAction`) + a "create account" link — all carrying `next` = the current
   booking URL so they return to booking after auth. Email/password works inside webviews (no OAuth).
4. **`next` end-to-end**: every sign-in entry from booking carries `next` = the reserve-pc URL (incl.
   `?pc=` if present). `memberSignupAction` gains `next` support (currently hardcodes `/account`).
5. **Harden the rest of the flow** (bulletproof end-to-end): verify auth/callback returns to `next`;
   the `oauth_failed` path; already-signed-in + expired-session; the gate → PC/time select → PayMongo
   payment → confirmation path has no dead-ends or unhandled errors.

## Constraints
- Next.js 16 in this repo differs from training data — mirror existing repo patterns (server actions,
  `headers()`, `redirect`, the existing login page). Don't invent APIs.
- AGENTS.md: every `<button>`/`<Link>`/`<a>` MUST have a `title` (or `aria-label`).
- Website CODE deploys are NOT owner-gated (only the POS installer is) — but DO NOT deploy/push without
  the owner's say; commit locally. No Supabase schema changes without approval.

## Completion criteria
- Webview users can BOOK: they get a working path (open-in-browser banner + email sign-in) instead of a
  Google dead end.
- `next` returns them to the booking page after any sign-in method.
- `next build` (or typecheck/lint) passes; the changed flow reviewed for dead-ends.
- ≥3 iterations logged in RALPH-BOOKING.md; final summary written.
When all hold: <promise>COMFFEE-BOOKING-BULLETPROOF</promise>
