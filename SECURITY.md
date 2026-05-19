# Security

This file documents the security posture of the Comffe Drink & Play web app — what's protected, what isn't, and what's still your responsibility as the operator.

## Threat model

The app handles:
- Customer PII (names, emails, phones) via contact form, signup, bookings, orders
- Payment intent IDs and amounts (via PayMongo) — actual card data never touches our servers
- Admin authentication (Supabase Auth)
- Internal admin operations (refunds, manual confirmations, content edits)
- Anonymous chat sessions

We assume attackers will try to:
1. Spam endpoints (contact form, chat, booking holds) to disrupt service
2. Brute-force admin credentials
3. Enumerate promo codes or registered emails
4. Bypass server-side validation by calling APIs directly
5. CSRF — trick a logged-in admin into performing actions
6. XSS — inject scripts via user-controlled fields
7. SQL injection — via any query
8. Steal session cookies / tokens
9. Hijack abandoned booking holds to deny availability

## Mitigations in place

### Authentication & authorization
- **Supabase Auth** for both members and admins (battle-tested, separate JWT per role)
- **Row Level Security** on every table (`0002_rls_policies.sql`) — public read for published content only, admin writes gated by `is_admin()` Postgres function, members own-row reads
- **Admin login rate-limited** — 5 attempts per IP per 15 minutes (`admin/_actions/auth.ts`)
- **Member login rate-limited** — 10 attempts per IP per 15 minutes
- **Member signup rate-limited** — 5 attempts per IP per hour
- **Generic auth errors** — failed login returns `invalid_credentials` regardless of whether the email exists, preventing user enumeration
- **`require-admin.ts`** server gate redirects unauthenticated callers, used by every admin page
- **API admin routes** re-verify auth on every request (no relying on cookies alone)
- Session cookie refresh via `src/proxy.ts` (Supabase SSR)

### Input validation
- **Zod schemas** on every public API route — type, length, format, required fields
- **Server-side price snapshots** for orders + reservations — never trust client-supplied prices
- **Server-side promo validation** — even if client validates, server recomputes
- **Length caps** on every text field at the schema level
- **Body size limits** at the route level (4-16 KB depending on endpoint) — prevents JSON bombs

### Anti-abuse / rate limiting
In-memory sliding-window rate limiter (`src/lib/rate-limit.ts` + `src/lib/security.ts`). Per-IP bucket per endpoint:

| Endpoint | Limit | Window |
|---|---|---|
| `POST /api/contact` | 5 | 5 min |
| `POST /api/chat/start` | 10 | 5 min |
| `POST /api/chat/messages` | 30 | 5 min |
| `GET /api/chat/messages` | 60 | 5 min |
| `POST /api/promo-codes/validate` | 10 | 5 min |
| `POST /api/payments/create-intent` | 10 | 10 min |
| `POST /api/orders/create` | 10 | 10 min |
| Admin signin (server action) | 5 | 15 min |
| Member signup (server action) | 5 | 60 min |
| Member login (server action) | 10 | 15 min |

Returns `429 rate_limited` with `Retry-After` header.

> **Note:** the in-memory limiter is per-instance. On Vercel serverless this means effective limits are `limit × instances`. For high-volume production, swap `lib/rate-limit.ts` to use Upstash Redis or Vercel KV. The interface stays the same.

### CSRF protection
- **Origin / Referer verification** on every public mutating route via `originAllowed()` — requests from other sites are rejected with `403 bad_origin`
- Server actions get Next.js's built-in same-origin POST validation
- `X-Frame-Options: DENY` prevents clickjacking via iframes

### Spam protection
- **Honeypot field** on the contact form (`website` field hidden via off-screen positioning + `tabIndex={-1}`). Bots fill it; humans don't. Triggered submissions return `200 ok` to avoid signaling the bot.
- For higher protection, consider adding Cloudflare Turnstile or hCaptcha — see "What you should add later" below.

### Promo code enumeration
- `/api/promo-codes/validate` returns the **same generic error** (`invalid_or_expired`) for every failure mode (not found, inactive, expired, wrong target, used up, below min). Combined with rate limiting, this makes enumeration impractical.

### CSRF / clickjacking / MIME / referrer
Security headers applied to every response (`next.config.ts`):
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self), usb=()`
- `X-DNS-Prefetch-Control: on`
- `X-Powered-By` removed (`poweredByHeader: false`)

### Cron endpoints
- `/api/cron/sync-airbnb`, `/api/cron/release-expired-holds`, `/api/cron/cleanup-old-events` are **fail-closed in production** (`lib/cron-auth.ts`)
- If `CRON_SECRET` is unset in prod they return `503 cron_secret_not_configured`
- Constant-time secret comparison (`xor + accumulator`) defeats timing attacks

### Webhook security
- `/api/webhooks/paymongo` verifies HMAC-SHA256 signature against `PAYMONGO_WEBHOOK_SECRET`
- Signature comparison uses `crypto.timingSafeEqual` (constant time)
- **Idempotent** via the `paymongo_webhook_events` table's unique constraint on `paymongo_event_id` — replay attacks return `200 duplicate`
- Old webhook events pruned after 90 days by `/api/cron/cleanup-old-events`

### Open redirect prevention
- The `next` query param on member login is whitelisted to start with `/` and not `//` (no protocol-relative URLs) — `account/_actions/auth.ts`

### XSS
- React escapes all string interpolation by default
- `dangerouslySetInnerHTML` is used in only **two** places, both with hardcoded values: JSON-LD on branch pages, and a static included-features list. No user content.
- No `eval()`, no `new Function()`, no `innerHTML` writes anywhere

### SQL injection
- All queries go through Supabase's parameterized client builder (`.eq()`, `.lt()`, `.in()`, etc.)
- Only one piece of raw SQL anywhere: the GIST exclusion constraint, which is hardcoded in the migration
- No string-interpolated SQL anywhere in app code

### File upload security
- `/api/admin/upload` is admin-gated (verifies `admin_users` row)
- 5 MB max file size
- MIME whitelist: `image/jpeg`, `image/png`, `image/webp`, `image/avif`
- Folder name sanitized: `replace(/[^a-z0-9-_/]/gi, "")`
- Filename randomized: `${folder}/${timestamp}-${random}.${ext}` — no user-controlled paths
- Upload goes to a public Supabase Storage bucket (intentional — these are branch photos)

### Payment security
- **Card data never touches our servers** — PayMongo Payment Links handle the entire checkout
- We store only the link ID and the final payment ID (for refunds)
- All amounts re-computed server-side from menu/branch data — clients can't manipulate prices
- Refunds require admin auth + the stored `paymongo_payment_id` — no client-supplied amounts

### Audit trail
- Every admin write to branches, menu, settings, photos, rates, amenities, airbnb_calendars, promo_codes is logged via Postgres triggers (`0003_audit_log_triggers.sql`) to `audit_log`
- Audit log is admin-readable at `/admin/audit-log` with filters
- Audit entries are pruned after 1 year by `/api/cron/cleanup-old-events`

### Database hygiene
- `cleanup-old-events` cron prunes old data so the DB doesn't grow unbounded:
  - `paymongo_webhook_events` older than 90 days
  - `audit_log` older than 1 year
  - cancelled `reservations` older than 1 year
  - resolved `chat_conversations` older than 6 months (cascades messages)

## What you should add later (recommended)

These would harden things further but require external services or significant work:

1. **Bot challenge on contact + signup** — Cloudflare Turnstile (free), hCaptcha, or Google reCAPTCHA. The honeypot catches dumb bots; a captcha catches sophisticated ones.
2. **Distributed rate limiting** — Upstash Redis or Vercel KV. Replace `lib/rate-limit.ts` with the same interface backed by Redis. Required for multi-instance deployments.
3. **Content Security Policy** — strict CSP with per-request nonces. Requires reworking how inline styles are emitted (we use Tailwind v4 + framer-motion which both need `style-src 'unsafe-inline'` without nonces).
4. **MFA on admin accounts** — Supabase Auth supports TOTP. Enable in your Supabase dashboard, then add the enrollment flow to `/admin`.
5. **Email verification on signup** — already supported by Supabase Auth (off by default). Toggle in the Supabase dashboard.
6. **Anomaly alerts** — pipe failed admin logins / unusual refund volumes to a Slack/Discord webhook.
7. **WAF** — Cloudflare in front of the Vercel deployment blocks known-bad traffic before it hits the app.
8. **Penetration test** before launch — pay a professional or run OWASP ZAP / Burp Suite against a staging deployment.
9. **Dependency audit** — `npm audit` regularly; consider Dependabot or Renovate for automated PRs.
10. **Secrets rotation** — rotate `SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_*`, `CRON_SECRET`, `FIREBASE_PRIVATE_KEY` quarterly. Never commit them.

## What's still your responsibility

The app code can't enforce these — they're operational:

- **Set strong env-var values** for `CRON_SECRET`, `PAYMONGO_WEBHOOK_SECRET`. Use `openssl rand -base64 32` to generate them.
- **Never commit `.env.local`** — it's in `.gitignore`, but double-check before pushing.
- **Limit who has the Supabase service-role key** — it's database-admin equivalent.
- **Use separate Supabase projects for dev/staging/prod** — never test against production data.
- **Rotate the admin password** if a staff member with admin access leaves.
- **Monitor `audit_log`** periodically — that's why we built it.
- **Keep dependencies updated** — `npm outdated`, then PR-by-PR upgrades with testing.
- **Review the PayMongo Dashboard webhooks** — make sure only your verified URL is registered.
- **Configure Supabase email confirmation** if you want signup to require email verification.
- **Set up Vercel preview-deployment password protection** if you don't want unfinished features publicly visible.

## Reporting a vulnerability

If you discover a security issue, please email the company contact (in `site_settings.contact_email`) rather than opening a public issue. We'll acknowledge within 48 hours.
