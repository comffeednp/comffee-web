# RALPH LOOP — Booking flow bulletproof (in-app-browser / Google OAuth block)

Spec: docs/specs/2026-06-25-booking-webview-bulletproof.md. Promise: COMFFEE-BOOKING-BULLETPROOF. Min 3 iterations.

## STATUS
| item | status |
|------|--------|
| in-app-browser detection util | IN-PROGRESS |
| WebviewNotice banner (gate + login) | IN-PROGRESS |
| email path on booking gate (+ next) | TODO |
| memberSignupAction next support | TODO |
| harden flow (callback/oauth_failed/payment dead-ends) | TODO |
| verify (tsc/build) | TODO |

## SUMMARY
_TBD_

## ITERATION LOG
### Iteration 1 — core fix
- Root cause confirmed: reserve-pc gate offers only Google; Google blocks OAuth in Messenger/FB/IG webviews
  (Error 403 disallowed_useragent). /account/login already has email+Google+next. Building the fix.
