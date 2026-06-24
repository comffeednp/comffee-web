# RALPH LOOP — Booking flow bulletproof (in-app-browser / Google OAuth block)

Spec: docs/specs/2026-06-25-booking-webview-bulletproof.md. Promise: COMFFEE-BOOKING-BULLETPROOF. Min 3 iterations.

## STATUS
| item | status |
|------|--------|
| in-app-browser detection util (src/lib/in-app-browser.ts) | DONE |
| WebviewNotice banner (reserve-pc gate + login + signup) | DONE |
| email path on booking gate (+ next) | DONE |
| memberSignupAction + signup page next support | DONE |
| harden flow (callback/next/all booking entries) | DONE |
| verify (tsc + eslint + next build) | DONE — all green |

## SUMMARY — booking flow is now bulletproof against the in-app-browser block
Root cause: the reserve-pc gate offered ONLY "Sign in with Google", which Google blocks in
Messenger/FB/IG in-app browsers (Error 403 disallowed_useragent). Since most traffic is Messenger
links, customers were dead-ended. Fixed end-to-end:
- **src/lib/in-app-browser.ts** — detects FBAN/FBAV (FB/Messenger), Instagram, LINE, TikTok, Snapchat,
  X, Google-app webviews from the UA (SSR, no flash).
- **WebviewNotice** banner — "open in Chrome/Safari" guidance + one-tap Copy-link (clipboard + textarea
  fallback). Shown on the reserve-pc gate, /account/login, /account/signup when in a webview.
- **reserve-pc gate** — added inline **email sign-in** (works inside webviews) + "Create an account"
  link, all carrying `next` = the booking URL. Google still offered for real browsers.
- **next end-to-end** — memberSignupAction + signup page now thread `next`; login/google/auth-callback
  already did. Whitelisted to internal paths (no open redirect).
- **Coverage**: ALL booking entries are covered. reserve-pc directly; playcation/book and any other
  `requireMember`-gated flow redirect to /account/login (now banner+email+next). Verified there are only
  4 Google gates total — login, signup, reserve-pc (all fixed) + attendance.
- Verified: `tsc --noEmit` clean, eslint clean on new code, **`next build` succeeds** (prod compile).

### NEEDS-OWNER / follow-up (out of booking scope)
- **Staff attendance clock-in** (`partners/[slug]/attendance`) has the SAME Google-only gate and staff
  also open it via Messenger links. Recommend adding the same WebviewNotice banner there (cheap). Flag
  only — not done, since the ask was the booking flow.
- Deploy: changes are committed locally on `main`, NOT pushed/deployed. Push to deploy via Vercel when ready.

## ITERATION LOG
### Iteration 1 — core fix
- Root cause confirmed: reserve-pc gate offers only Google; Google blocks OAuth in Messenger/FB/IG webviews
  (Error 403 disallowed_useragent). Built in-app-browser util + WebviewNotice + reserve-pc gate (banner +
  inline email + create-account, all with next). tsc + eslint clean. Commit d66537e.
### Iteration 2 — auth pages + next
- Added the banner to /account/login + /account/signup; threaded `next` through memberSignupAction + signup
  page (login/google/callback already had it). tsc clean; new code lint-clean. Commit e3ffeae.
### Iteration 3 — verify + full coverage
- `next build` SUCCEEDS (production compile, incl. reserve-pc). Confirmed only 4 Google gates exist;
  playcation/book + other requireMember flows redirect to the now-fixed login page → fully covered.
  Flagged staff attendance (same gate, out of scope). Wrote summary. DONE.
