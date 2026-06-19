# Comffee Game Top-Ups — design & build record

> Customer-facing storefront where players buy Valorant / League points at the cafe.
> The customer orders + pays online; **Comffee staff** buy the points on Codashop with our own
> SIM carrier-billing; the site auto-confirms delivery and emails our own branded receipt.
> Philippines only. We do **not** use Codashop's reseller program — staff fulfil manually at retail.
> Profit = the gap between our cheap SIM cost and what we charge.

Route: **`/game-topups`** · Staff ops console: **`/admin/game-topups`** · Money: **Comffee's** (platform PayMongo key).

---

## Part A — plain English (the intent)

One customer, start to finish (Juan wants 2525 VP):

1. Juan opens the site. It checks he's in the Philippines — if not, blocked.
2. He types his Riot ID, picks his amount. 2525 isn't a single package, so it becomes a combo:
   2050 VP + 475 VP (he adds both packages to his order).
3. He pastes a screenshot of his in-game profile. The site reads the name in the screenshot and
   checks it matches what he typed — this kills typos before any money moves.
4. He enters his email, ticks "my details are correct — no refunds if they are," and pays (GCash/card).
5. The order appears on staff's screen with copy buttons for the Riot ID — no retyping.
6. Staff buys 2050 VP on Codashop. The OTP text hits our phone; the phone auto-sends the OTP to the
   staff screen to copy-paste. Codashop emails a receipt → the site ticks ✅ 2050 VP.
7. Staff buys 475 VP the same way → site ticks ✅ 475 VP.
8. Both boxes ticked = full amount delivered → the site emails Juan our Comffee receipt (our logo,
   our email). He never sees a Codashop receipt.

### Safety nets (why each exists)
- **Screenshot check** → no wrong-account mistakes. Customer proved the account is theirs → no refunds
  on a correct delivery.
- **3 tries then locked** (15 min, then 24 h) → stops people spamming the check.
- **Robot blocker + daily limit** → the screenshot reader (Google Vision) costs money per use; a hard
  daily ceiling shuts it off so a hacker can't run up our bill.
- **One order at a time on the phone + matching by Riot ID** → every OTP/receipt maps to the right
  customer; no mix-ups.
- **The site only believes "paid" from PayMongo directly** (signed webhook) → nobody can fake a payment.
- **If we can't deliver → auto-refund** (that's the law). Customer's own correct-but-unwanted order → no refund.

### Self-running parts
- Prices auto-update daily from Codashop, always keeping our discount (default 8%, editable in admin).
  If a price looks wrong, it freezes and warns instead of selling at a bad price.
- New games (e.g. Mobile Legends) → added by hand once, then auto-update like the rest.

### Marketing placement
A "Game Top-Ups" tab on the headbar; for partner cafes/franchises on Comffee POS / Clockwork, a
first-launch banner that redirects (opens browser) to `/game-topups`. (Redirect link only — not rebuilt in-app.)

---

## Part B — how it's actually built in comffee-web

Stack: Next.js 16 (App Router) + Supabase (`uioeefxnugnqhvthaxjf`) + Vercel + Resend + Google Vision +
PayMongo. No vendor SDKs — every external service is a hand-rolled `fetch` client in `src/lib`.

### Engineering decisions / deviations from the raw spec (and why)

| Spec said | We did | Why |
|---|---|---|
| `amount_centavos` integer | `amount_php numeric(10,2)` | Repo-wide money idiom; the PayMongo client takes **pesos** and `*100`s internally. Mixing units on a money path is exactly the bug class CLAUDE.md warns about. |
| Cloudflare Turnstile before every Vision call | `guardMutating` (origin + per-IP rate limit) + 3-try ladder + **daily Vision circuit breaker** + a **no-op Turnstile seam** | The repo has no Turnstile dep and deliberately uses `guardMutating` + fail-open integrations. The circuit breaker is the actual cost ceiling. Turnstile drops in later by setting `TURNSTILE_SECRET_KEY` (the seam fails open when unset, like Vision/Resend/PayMongo). |
| Edge middleware `geo.country` | `x-vercel-ip-country === 'PH'` re-checked server-side on every order/OCR/pay endpoint + PayMongo PHP-only | Repo's `proxy.ts` only refreshes the auth cookie; there is no IP-geo today. Vercel injects the country header in prod. The hard gate is that a VPN user still can't pay in PHP. |
| Per-cafe `settings` table | platform `site_settings` keys (`getTopupSettings()`) | This is Comffee's own operation, not per-cafe; matches the repo's existing key/value config pattern. |
| `system_counters` | `game_topup_counters` (one row per day) | Atomic daily Vision-call counter for the circuit breaker. |
| Combo solver | order = customer-assembled **list of package lines** | §10 already models an order as package lines; "2525 = 2050+475" is just adding two packages. No solver needed (a `splitTargetIntoPackages` helper exists only to power quick-pick presets). |
| Money ownership unstated | **platform PayMongo key** (Comffee's account), hosted Checkout Session | Top-ups are Comffee's revenue, not a cafe's. Mirrors the `subscription_orders` flow exactly. |

### Data model (`supabase/migrations/0059_game_topups.sql`)

All tables prefixed `game_topup_` to avoid colliding with the existing `orders` / `member_topups` /
`pc_reservations`.

- **`game_topup_orders`** — id, riot_id, riot_tag, region, game, target_vp, fulfilled_vp,
  amount_php, customer_email, screenshot_path (PRIVATE bucket), ocr_text, ocr_tries, ocr_block_level,
  ocr_blocked_until, verified, consent_at, status (`draft|verified|pending|processing|delivered|failed|refunded`),
  source_cafe_id (attribution only), claimed_by_admin_id, claimed_at, status_token (public status link),
  paymongo_checkout_id (cs_), paymongo_payment_intent_id (pi_ — **webhook match key**),
  paymongo_payment_id (pay_), sla_due_at, paid_at, delivered_at, created_at, updated_at.
- **`game_topup_order_lines`** — order_id, sku, vp_amount, codashop_price, customer_price,
  status (`pending|verified`), matched_ref, verified_at, position.
- **`game_topup_catalog`** — sku (unique), game, region, vp_amount, label, codashop_price,
  discount_pct, customer_price, active, frozen, source_url, last_synced_at, sort_order.
- **`game_topup_games`** — slug (unique), name, region_default, codashop_url, active, sort_order.
- **`game_topup_fulfillment_events`** — order_id, line_id, vp_added, source
  (`codashop_email|sms|manual`), raw_text, ref (**unique** for dedupe), created_at.
- **`game_topup_otp_relay`** — otp, sim, raw, created_at, expires_at, consumed.
- **`game_topup_counters`** — day (pk), vision_calls.

RLS: everything is **service-role-only (no policies)** except
- `game_topup_catalog` / `game_topup_games`: public read where `active`, admin all (customers see prices).
- `game_topup_orders` / `game_topup_order_lines`: admin read (`public.is_admin()`) so the staff console
  can use Supabase **Realtime**; writes are service-role only.
Customer order status is served **server-side keyed by `status_token`** (no public select policy on orders).

`game_topup_orders` + `game_topup_order_lines` are added to the `supabase_realtime` publication.

### State machine (server-side, idempotent — client never authoritative)

```
draft ──OCR pass──> verified ──paid(webhook)──> pending ──staff claim──> processing ──all lines ✅──> delivered
  │                                                  │                        │
  └── OCR retry (ladder)                             └── SLA breach ─> failed ─> refunded (auto)
```

The paid flip is a conditional `UPDATE ... .eq('status','verified')` inside the PayMongo webhook only.

### Money path
`POST /api/game-topup/create` → insert `verified` order + lines (unpaid) → `createCheckoutSession`
(platform key, `qrph`+`card`≥₱100, `remarks: game_topup:<id>`) → store cs_/pi_ → return `checkout_url`.
The existing `/api/webhooks/paymongo` gets one new lookup+dispatch branch matching on **pi_** then cs_,
flipping `verified→pending` and stamping `paid_at`. On `payment.failed` → `verified` (retry).

### OCR + abuse/billing shield (`/api/game-topup/ocr`)
`guardMutating` → daily Vision **circuit breaker** (`game_topup_counters`, hard cap → 503 + alert) →
Turnstile seam → image (≤2 MB, MIME allowlist, client-downscaled) → Vision `TEXT_DETECTION` →
`matchName(ocrText, riotId)` (normalise + edit-distance ≤2). Ladder keyed to the **order** (not IP —
shared cafe NAT): 3 fails → 15-min lock; +3 → 24-h lock. Success resets + flips `draft→verified` and
stores `screenshot_path`. Fail-OPEN when Vision is unconfigured/erroring (flag for manual review),
fail-CLOSED on a definitive name mismatch.

### Fulfilment
- Staff console `/admin/game-topups`: Realtime `pending` queue, one **Processing per phone** (claim
  lock), copy buttons (Riot ID / #tag), per-line combo checklist, screenshot (signed URL), live OTP feed.
- **OTP relay** `POST /api/game-topup/otp` (bearer `TOPUP_RELAY_TOKEN`) ← MacroDroid. Rows expire ~5 min.
- **Confirmation** — primary `POST /api/game-topup/confirm/email` (inbound Codashop receipt, bearer
  `TOPUP_INBOUND_TOKEN`); fallback `POST /api/game-topup/confirm/sms`. Each parses Riot ID + VP + ref →
  ticks **one** unverified line of that exact VP on the matching open order; dedupe on `ref`; no match →
  "needs review"; never short-completes. All lines ✅ → `delivered` + branded receipt email.

### Self-sustaining catalog
`/api/cron/game-topup-price-sync` (daily, Vercel cron): re-reads Codashop price per active SKU,
`customer_price = round(codashop_price × (1 − discount%))`. Freeze + alert on fetch fail / parse fail /
>±20% move (configurable). Discount % (global + per-game) editable in admin.

### Refunds / SLA
`/api/cron/game-topup-sla-sweep`: orders stuck in `pending`/`processing` past `sla_due_at` →
`issueRefund({ ... })` → `failed`→`refunded`. Verified-correct delivered order → no refund (proof on file).

### Admin settings (`site_settings` keys, `/admin/game-topups/settings`)
`gt_discount_pct` (global), `gt_discount_pct_<game>` (override), `gt_vision_daily_cap`,
`gt_ocr_lock_minutes_1` / `gt_ocr_lock_minutes_2`, `gt_sla_minutes` (default 60),
`gt_price_freeze_threshold_pct` (default 20), `gt_enabled`. Plus catalog + games table editors.

---

## Deployment status — LIVE since 2026-06-20

**Done:**
- ✅ Repo `comffee-web`; committed `a8c22c2` + pushed `main` → Vercel production; redeployed so env is live.
- ✅ Migration `0059` applied to live Supabase `uioeefxnugnqhvthaxjf` (`node scripts/apply-migration.mjs 0059`) —
     verified: catalog seeded (5 Valorant packages), Valorant active, League hidden, order tables empty.
- ✅ Env set in Vercel (production + preview + development): `TOPUP_RELAY_TOKEN`, `TOPUP_INBOUND_TOKEN`
     (values stored locally only, NOT in this repo). Reuses `PAYMONGO_*`, `GOOGLE_VISION_API_KEY`,
     `RESEND_API_KEY`/`RESEND_FROM`, `CRON_SECRET`. Optional later: `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`.
- ✅ Storefront live at `https://www.comffee.org/game-topups`; "Game Top-Ups" headbar tab + a promo banner at
     the top of every partner-cafe page (`/partners/[slug]`) linking to the store.

**⚠ Canonical host — use `www.comffee.org` for the relay/inbound endpoints.** The apex `comffee.org` 307-
redirects to `www`, and that redirect **strips the `Authorization` header** → 401. Browsers follow it fine
(the storefront works on both), but a simple HTTP client (MacroDroid) must POST directly to `www.comffee.org`.

**Where to set the discount:** `https://www.comffee.org/admin/game-topups/settings` → **"Default discount %
(global)"** (seeded 8%); per-package overrides in the **Catalog** editor on the same page (each row has a
Discount % field). `customer_price = round(codashop_price × (1 − discount%))`, so the customer price is
*intentionally lower* than Codashop retail (that IS the discount you give customers) — your margin is the gap
between the cheap SIM carrier-billing cost and your selling price. 0% = same as Codashop. (Seed example:
475 VP = Codashop ₱199 → ₱183 at 8%.)

**Remaining to switch on hands-off AUTO-fulfilment (manual fulfilment via the console works now):**
1. ⬜ MacroDroid: SMS-received → POST to `https://www.comffee.org/api/game-topup/otp` (+ `/confirm/sms`),
      header `Authorization: Bearer <TOPUP_RELAY_TOKEN>`.
2. ⬜ Inbound email: forward the Codashop operator inbox → `https://www.comffee.org/api/game-topup/confirm/email`,
      header `Authorization: Bearer <TOPUP_INBOUND_TOKEN>` (Cloudflare Email Routing / Resend inbound / a forwarder).
3. ⬜ Supply the 3 external facts (§19) to finish parsing + live pricing: one real OTP SMS (sender + digit count);
      one real Codashop receipt email (PII blanked); Codashop price-page URLs per game → then implement
      `fetchCodashopPrice` (price-sync is a discount-only recompute until then).
4. ⬜ Activate **card** on the PayMongo account if card checkout is wanted (QRPh already live).
5. ⬜ Wire `/api/cron/game-topup-sla-sweep` into the every-15-min Windows Scheduled Task (Vercel crons are daily).
