# Comffe Drink & Play

A computer-cafe-meets-gaming-staycation web app for **Comffe Drink & Play** — internet cafes and Playcation stays across the Philippines.

> **Status:** Phase 0 + 1 (foundation + public marketing site + admin CRUD). Phases 2-5 (Playcation booking with Airbnb sync, advance orders, member reservations, live chat) are mapped out in `../Users/Alysa Mae/.claude/plans/ticklish-herding-hopper.md`.

## Stack

- **Next.js 15** (App Router, RSC, server actions, TypeScript)
- **Supabase** — Postgres + Auth + Storage + Realtime (free tier)
- **Tailwind CSS v4** — themed via `globals.css` (`@theme inline`)
- **Framer Motion + Lenis + Embla** — for the cinematic scroll feel
- **PayMongo** — Phase 2/3 (PH payment processor: GCash, Maya, cards)
- **Firebase Cloud Messaging** — Phase 5 (push notifications to admin phones)

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a free project at https://supabase.com
2. Open the SQL Editor and run, in order:
   - `supabase/migrations/0001_init_schema.sql`
   - `supabase/migrations/0002_rls_policies.sql`
   - `supabase/migrations/0003_audit_log_triggers.sql`
   - `supabase/seed.sql` (optional — sample branches/menu so the site has something to render)
3. Create a Storage bucket named `branch-photos` (set to **public**) for image uploads.
4. Go to **Project Settings → API** and grab the URL, anon key, and service role key.

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API (server-only — keep secret) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` for dev |
| `NEXT_PUBLIC_STORAGE_BUCKET` | `branch-photos` (default) |

### 4. Create your first admin user

The app uses Supabase Auth for both members and admins. To create yourself an admin login:

1. In Supabase, go to **Authentication → Users → Add user** and create a user with email + password.
2. In the SQL Editor, copy that user's `id` and run:

```sql
insert into public.admin_users (auth_user_id, full_name, role, is_active)
values ('PASTE-USER-ID-HERE', 'Your Name', 'super_admin', true);
```

### 5. Run it

```bash
npm run dev
```

Open http://localhost:3000 — public site.
Open http://localhost:3000/admin — admin login.

## Project structure

```
src/
  app/
    layout.tsx              ← root, header/footer/chat widget
    page.tsx                ← home (cinematic hero, two networks split, all branches)
    branches/page.tsx       ← branches index
    branches/[slug]/page.tsx← branch detail (parallax hero, walk-through gallery, etc.)
    menu/page.tsx
    playcation/page.tsx     ← gaming staycation landing
    contact/page.tsx
    about/page.tsx
    sitemap.ts / robots.ts  ← SEO
    api/
      contact/route.ts      ← contact form handler
      admin/upload/route.ts ← image upload (admin only)
    admin/
      layout.tsx            ← admin shell + nav
      page.tsx              ← login
      dashboard/page.tsx
      branches/             ← branch CRUD + amenities/rates/photos editors
      menu/                 ← menu CRUD
      settings/             ← site settings
      contact-submissions/  ← inbox
      _actions/             ← server actions for the above
  components/
    site/                   ← public components (Header, Footer, BranchCard,
                              HeroParallax, PhotoStrip, TerminalIntro, etc.)
    admin/                  ← admin components (BranchCoreFields, etc.)
  lib/
    supabase/{client,server,admin,types}.ts
    branches.ts             ← data loaders for branches
    menu.ts                 ← data loader for menu
    settings.ts             ← data loader for site_settings
    auth/require-admin.ts   ← admin auth gate for server components
    utils.ts                ← cn, formatPHP, slugify, etc.
  middleware.ts             ← Supabase auth cookie refresh
supabase/
  migrations/               ← SQL — run in order
  seed.sql                  ← sample data
```

## Design system — "Computer Cafe Gothic"

The brand is built around **computers as the center**:

- **Espresso-dark base** + **amber CTAs** + **phosphor green** terminal accents
- Monospace as the dominant typeface (Geist Mono), Space Grotesk for display headlines
- **Monitor-frame** photo galleries (`.monitor-frame` + `.monitor-screen`)
- **Keyboard-key buttons** (`.key-cap`, `.key-cap-primary`, `.key-cap-phosphor`)
- **Status chips** with pulsing dots (`.status-chip`)
- **Terminal labels** (`// section_name`)
- **CRT scanlines** (`.crt-scanlines`)
- **Glow** utilities (`.glow-amber`, `.text-glow-amber`)
- **Boot-sequence** typing intro (`<TerminalIntro />`)
- **Parallax hero** (`<HeroParallax />`)
- **Reveal-on-scroll** wrapper (`<Reveal />`)

All theme tokens live in `src/app/globals.css` under `@theme inline`. Customize colors there.

## Key architecture decisions

These are documented in detail in the plan file. The non-negotiables:

1. **Single `reservations` table** (not separate "bookings" + "blocks"). A Postgres GIST exclusion constraint makes double-booking *mathematically impossible*. Lives in `0001_init_schema.sql`. We don't use this table until Phase 2 — but the schema is in place.
2. **Audit log** triggers on every admin write (`0003_audit_log_triggers.sql`).
3. **RLS-everywhere** — public read for published content, admin gate via the `is_admin()` Postgres function.
4. **Server actions** for admin CRUD — type-safe, no client JSON glue, automatic `revalidatePath` for instant content propagation.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import in Vercel — it auto-detects Next.js.
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STORAGE_BUCKET`.
4. Deploy.

Phase-2+ features will need additional env vars (PayMongo, FCM, Resend, CRON_SECRET).

## What's coming in later sessions

| Phase | Scope |
|---|---|
| **2** | Playcation booking flow, Airbnb iCal bidirectional sync, soft-hold pattern, PayMongo, admin booking inbox |
| **3** | Advance menu orders + cart + PayMongo + admin orders inbox |
| **4** | Member auth + internet cafe reservations with admin manual timer |
| **5** | Live chat (Supabase Realtime) + admin PWA + Firebase push notifications |
| **6** | Audit log UI, promo codes, refunds, Capacitor wrapper if iOS PWA push is unreliable |

See the plan file for the complete roadmap and architectural rationale.
