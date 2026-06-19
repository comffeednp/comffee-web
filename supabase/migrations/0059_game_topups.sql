-- 0059_game_topups.sql   (project: uioeefxnugnqhvthaxjf — comffee-web)
-- Game Top-Ups: customer-facing Valorant/League points store. Customer orders + pays online
-- (Comffee's money → PLATFORM PayMongo key); Comffee staff buy the points on Codashop manually;
-- the site auto-confirms delivery and emails our own branded receipt. PH only.
--
-- All tables prefixed game_topup_ to avoid colliding with the existing orders / member_topups /
-- pc_reservations. Money is stored as pesos numeric(10,2) (repo-wide idiom; PayMongo client *100s).
-- Additive + idempotent (safe to re-run). See docs/game-topups-design.md.

-- ── Orders ──────────────────────────────────────────────────────────────────
create table if not exists public.game_topup_orders (
  id                          uuid primary key default gen_random_uuid(),
  game                        text not null default 'valorant',
  region                      text not null default 'AP',
  riot_id                     text not null,                 -- the in-game name (before the #tag)
  riot_tag                    text not null,                 -- the #tag (without the '#')
  target_vp                   integer not null default 0,    -- sum of the order's package lines
  fulfilled_vp                integer not null default 0,    -- sum of verified lines
  amount_php                  numeric(10,2) not null default 0,
  customer_email              text,
  screenshot_path             text,                          -- PRIVATE bucket path (signed on read)
  ocr_text                    text,
  ocr_tries                   integer not null default 0,
  ocr_block_level             integer not null default 0,    -- 0 none, 1 = 15-min, 2+ = 24-h
  ocr_blocked_until           timestamptz,
  verified                    boolean not null default false,
  consent_at                  timestamptz,
  status                      text not null default 'draft'
                                check (status in ('draft','verified','pending','processing','delivered','failed','refunded')),
  source_cafe_id              uuid references public.branches(id) on delete set null, -- attribution only
  claimed_by_admin_id         uuid references public.admin_users(id) on delete set null,
  claimed_at                  timestamptz,                   -- one Processing per phone (claim lock)
  status_token                text not null default encode(gen_random_bytes(16),'hex') unique, -- public status link
  paymongo_checkout_id        text,   -- cs_…  (Checkout Session id, dashboard lookup)
  paymongo_payment_intent_id  text,   -- pi_…  (what the paid webhook carries — PRIMARY match key)
  paymongo_payment_id         text,   -- pay_… (audit)
  sla_due_at                  timestamptz,                   -- set when paid; SLA sweeper refunds past this
  paid_at                     timestamptz,
  delivered_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists game_topup_orders_pi_idx     on public.game_topup_orders (paymongo_payment_intent_id);
create index if not exists game_topup_orders_cs_idx     on public.game_topup_orders (paymongo_checkout_id);
create index if not exists game_topup_orders_status_idx on public.game_topup_orders (status, created_at desc);
create index if not exists game_topup_orders_riot_idx   on public.game_topup_orders (lower(riot_id), status);
create index if not exists game_topup_orders_sla_idx    on public.game_topup_orders (sla_due_at) where status in ('pending','processing');

-- ── Order lines (one row per package; an order is a list of packages) ────────
create table if not exists public.game_topup_order_lines (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.game_topup_orders(id) on delete cascade,
  sku           text not null,
  vp_amount     integer not null,
  codashop_price numeric(10,2) not null default 0,
  customer_price numeric(10,2) not null default 0,
  status        text not null default 'pending' check (status in ('pending','verified')),
  matched_ref   text,
  verified_at   timestamptz,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists game_topup_order_lines_order_idx on public.game_topup_order_lines (order_id, position);

-- ── Catalog (current Codashop price + our discounted price per package) ──────
create table if not exists public.game_topup_catalog (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null unique,
  game           text not null,
  region         text not null,
  vp_amount      integer not null,
  label          text not null,
  codashop_price numeric(10,2) not null,
  discount_pct   numeric(5,2) not null default 8,
  customer_price numeric(10,2) not null,
  active         boolean not null default true,
  frozen         boolean not null default false,   -- price-sync froze it (bad/suspicious move)
  source_url     text,
  last_synced_at timestamptz,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists game_topup_catalog_game_idx on public.game_topup_catalog (game, region, sort_order);

-- ── Games (added by hand once, then auto-synced like the rest) ───────────────
create table if not exists public.game_topup_games (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  region_default text not null default 'AP',
  currency_label text not null default 'VP',     -- e.g. "VP" (Valorant), "RP" (League)
  codashop_url   text,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ── Fulfilment events (append-only audit; one per Codashop confirmation) ─────
create table if not exists public.game_topup_fulfillment_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.game_topup_orders(id) on delete set null,
  line_id     uuid references public.game_topup_order_lines(id) on delete set null,
  vp_added    integer,
  source      text not null check (source in ('codashop_email','sms','manual')),
  raw_text    text,
  ref         text unique,                        -- Codashop reference; UNIQUE = dedupe
  created_at  timestamptz not null default now()
);

create index if not exists game_topup_fulfillment_order_idx on public.game_topup_fulfillment_events (order_id, created_at desc);

-- ── OTP relay (MacroDroid → site; shown next to the active order; ~5-min TTL) ─
create table if not exists public.game_topup_otp_relay (
  id          uuid primary key default gen_random_uuid(),
  otp         text not null,
  sim         text,
  raw         text,
  consumed    boolean not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists game_topup_otp_recent_idx on public.game_topup_otp_relay (created_at desc);

-- ── Daily Vision-call counter (billing circuit breaker) ─────────────────────
create table if not exists public.game_topup_counters (
  day          date primary key default current_date,
  vision_calls integer not null default 0
);

-- Atomic check-and-bump used by the OCR route: increments today's counter only if still under the
-- cap, returning whether the Vision call is allowed. SECURITY DEFINER so the route can call it.
create or replace function public.game_topup_try_vision(p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare allowed boolean;
begin
  insert into public.game_topup_counters as c (day, vision_calls)
  values (current_date, 1)
  on conflict (day) do update
    set vision_calls = c.vision_calls + 1
    where c.vision_calls < p_cap
  returning true into allowed;
  return coalesce(allowed, false);
end;
$$;

-- ── updated_at triggers (reuse the repo's set_updated_at() if present) ────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    execute 'drop trigger if exists game_topup_orders_set_updated on public.game_topup_orders';
    execute 'create trigger game_topup_orders_set_updated before update on public.game_topup_orders
             for each row execute function public.set_updated_at()';
    execute 'drop trigger if exists game_topup_catalog_set_updated on public.game_topup_catalog';
    execute 'create trigger game_topup_catalog_set_updated before update on public.game_topup_catalog
             for each row execute function public.set_updated_at()';
  end if;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.game_topup_orders              enable row level security;
alter table public.game_topup_order_lines         enable row level security;
alter table public.game_topup_catalog             enable row level security;
alter table public.game_topup_games               enable row level security;
alter table public.game_topup_fulfillment_events  enable row level security;
alter table public.game_topup_otp_relay           enable row level security;
alter table public.game_topup_counters            enable row level security;

-- Catalog + games: NO public-read policy. RLS is row-level, not column-level, so a "public read active"
-- policy would expose codashop_price (our wholesale cost) and discount_pct (our margin) to anyone with
-- the anon key. Instead the customer storefront reads these via the SERVICE-ROLE client selecting only
-- safe columns (sku, game, region, vp_amount, label, customer_price). Admin-all covers admin tooling;
-- all writes are service-role. Anon/authenticated get nothing here.
drop policy if exists game_topup_catalog_public_read on public.game_topup_catalog;
drop policy if exists game_topup_catalog_admin_all on public.game_topup_catalog;
create policy game_topup_catalog_admin_all on public.game_topup_catalog
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists game_topup_games_public_read on public.game_topup_games;
drop policy if exists game_topup_games_admin_all on public.game_topup_games;
create policy game_topup_games_admin_all on public.game_topup_games
  for all using (public.is_admin()) with check (public.is_admin());

-- Orders + lines: admin READ only (so the staff console can use Realtime). All WRITES are
-- service-role (getSupabaseAdmin, which bypasses RLS) — there is intentionally no insert/update
-- policy. Customer order status is served server-side keyed by status_token (no public read).
drop policy if exists game_topup_orders_admin_read on public.game_topup_orders;
create policy game_topup_orders_admin_read on public.game_topup_orders
  for select using (public.is_admin());
drop policy if exists game_topup_order_lines_admin_read on public.game_topup_order_lines;
create policy game_topup_order_lines_admin_read on public.game_topup_order_lines
  for select using (public.is_admin());

-- OTP relay: admin READ only (the staff console shows live OTPs via Realtime); inserts are service-role
-- (the relay endpoint). fulfillment_events / counters stay service-role only (no policies).
drop policy if exists game_topup_otp_admin_read on public.game_topup_otp_relay;
create policy game_topup_otp_admin_read on public.game_topup_otp_relay
  for select using (public.is_admin());

-- ── Realtime: stream order + line changes to the staff console ───────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='game_topup_orders') then
    alter publication supabase_realtime add table public.game_topup_orders;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='game_topup_order_lines') then
    alter publication supabase_realtime add table public.game_topup_order_lines;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='game_topup_otp_relay') then
    alter publication supabase_realtime add table public.game_topup_otp_relay;
  end if;
exception when others then null; -- publication created on first Realtime use; nice-to-have
end $$;

-- ── Seed: Valorant VP catalog (Codashop PH retail) + games ──────────────────
-- customer_price = round(codashop_price × (1 − 8%)). The daily price-sync recomputes these.
insert into public.game_topup_games (slug, name, region_default, currency_label, sort_order, active)
values
  ('valorant',          'Valorant',          'AP', 'VP', 1, true),
  ('league-of-legends', 'League of Legends', 'PH', 'RP', 2, false) -- no packages seeded yet → hidden until a catalog + Codashop URL are added
on conflict (slug) do nothing;

insert into public.game_topup_catalog (sku, game, region, vp_amount, label, codashop_price, discount_pct, customer_price, sort_order)
values
  ('valorant-vp-475',  'valorant', 'AP',  475, '475 VP',   199,   8,  183, 1),
  ('valorant-vp-1000', 'valorant', 'AP', 1000, '1000 VP',  399,   8,  367, 2),
  ('valorant-vp-2050', 'valorant', 'AP', 2050, '2050 VP',  799,   8,  735, 3),
  ('valorant-vp-3650', 'valorant', 'AP', 3650, '3650 VP', 1399,   8, 1287, 4),
  ('valorant-vp-5350', 'valorant', 'AP', 5350, '5350 VP', 1999,   8, 1839, 5)
on conflict (sku) do nothing;
