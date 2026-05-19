-- =============================================================
-- Comffe Drink & Play — initial schema
-- Foundation for all phases. Tables for later phases (chat,
-- payments, members, etc.) are created here so we never need
-- a destructive migration later.
-- =============================================================

-- Required extensions ----------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "btree_gist"; -- GIST exclusion on dates

-- ENUMs ------------------------------------------------------------------------
do $$ begin
  create type branch_type as enum ('cafe', 'playcation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type admin_role as enum ('super_admin', 'branch_manager', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_source as enum ('website', 'airbnb', 'manual_block');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum ('pending_hold', 'confirmed', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type internet_res_status as enum ('requested', 'confirmed', 'active', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_type as enum ('advance', 'onsite');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('placed', 'preparing', 'ready', 'served', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('unpaid', 'pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_sender as enum ('customer', 'admin', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_status as enum ('pending', 'active', 'suspended');
exception when duplicate_object then null; end $$;

-- Site settings ----------------------------------------------------------------
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

-- Admin users ------------------------------------------------------------------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text,
  role          admin_role not null default 'staff',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Members ----------------------------------------------------------------------
create table if not exists public.members (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique references auth.users(id) on delete set null,
  full_name      text not null,
  email          text,
  phone          text,
  member_number  text unique,
  status         member_status not null default 'pending',
  joined_at      timestamptz not null default now()
);

-- Branches ---------------------------------------------------------------------
create table if not exists public.branches (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  type             branch_type not null,
  tagline          text,
  address          text,
  city             text,
  phone            text,
  email            text,
  lat              numeric(10, 7),
  lng              numeric(10, 7),
  description_md   text,
  hero_image_url   text,
  hours_text       text,
  is_published     boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists branches_published_idx
  on public.branches (is_published, sort_order);

-- Admin ↔ Branch assignments (multi-branch staff) ------------------------------
create table if not exists public.admin_branch_assignments (
  admin_user_id  uuid not null references public.admin_users(id) on delete cascade,
  branch_id      uuid not null references public.branches(id) on delete cascade,
  primary key (admin_user_id, branch_id)
);

-- Branch amenities -------------------------------------------------------------
create table if not exists public.branch_amenities (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references public.branches(id) on delete cascade,
  icon         text not null default 'sparkles',
  label        text not null,
  description  text,
  sort_order   integer not null default 0
);
create index if not exists branch_amenities_branch_idx
  on public.branch_amenities (branch_id, sort_order);

-- Branch photos ----------------------------------------------------------------
create table if not exists public.branch_photos (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id) on delete cascade,
  storage_path  text not null,
  public_url    text,
  caption       text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists branch_photos_branch_idx
  on public.branch_photos (branch_id, sort_order);

-- Branch rates -----------------------------------------------------------------
create table if not exists public.branch_rates (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references public.branches(id) on delete cascade,
  category     text not null,        -- e.g. 'internet', 'playcation', 'snack', 'package'
  label        text not null,        -- e.g. 'PC Standard', 'Whole Unit'
  description  text,
  price_php    numeric(12, 2) not null,
  unit         text not null default 'hour',  -- 'hour', 'night', 'session'
  sort_order   integer not null default 0
);
create index if not exists branch_rates_branch_idx
  on public.branch_rates (branch_id, category, sort_order);

-- Menu -------------------------------------------------------------------------
create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  sort_order  integer not null default 0
);

create table if not exists public.menu_items (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid references public.menu_categories(id) on delete set null,
  name                text not null,
  description         text,
  base_price_php      numeric(12, 2) not null,
  photo_storage_path  text,
  is_global           boolean not null default true,
  available           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists menu_items_cat_idx
  on public.menu_items (category_id, sort_order);

create table if not exists public.branch_menu_overrides (
  branch_id          uuid not null references public.branches(id) on delete cascade,
  menu_item_id       uuid not null references public.menu_items(id) on delete cascade,
  price_override     numeric(12, 2),
  available_override boolean,
  primary key (branch_id, menu_item_id)
);

-- Reservations (Playcation + Airbnb merged) -----------------------------------
-- This single table holds website bookings, Airbnb-imported blocks, and manual
-- blocks. The GIST exclusion constraint mathematically prevents double-booking.
create table if not exists public.reservations (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references public.branches(id) on delete cascade,
  source              reservation_source not null default 'website',
  status              reservation_status not null default 'pending_hold',
  check_in            date not null,
  check_out           date not null,
  guest_name          text,
  guest_email         text,
  guest_phone         text,
  num_guests          integer default 1,
  total_php           numeric(12, 2),
  paymongo_intent_id  text,
  hold_expires_at     timestamptz,
  ical_uid            text,                  -- for Airbnb-sourced rows
  notes               text,
  created_at          timestamptz not null default now(),
  constraint reservations_dates_check check (check_out > check_in)
);

-- The crown jewel — mathematically impossible to double-book a confirmed/held slot.
alter table public.reservations
  drop constraint if exists reservations_no_overlap;
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    branch_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (status in ('pending_hold', 'confirmed'));

create index if not exists reservations_branch_status_idx
  on public.reservations (branch_id, status);
create index if not exists reservations_ical_uid_idx
  on public.reservations (ical_uid);

-- Internet cafe reservations (members-only, manual timer) ---------------------
create table if not exists public.internet_reservations (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null references public.members(id) on delete cascade,
  branch_id               uuid not null references public.branches(id) on delete cascade,
  station_label           text not null,
  requested_start         timestamptz not null,
  requested_end           timestamptz not null,
  actual_start            timestamptz,
  actual_end              timestamptz,
  time_extended_minutes   integer not null default 0,
  prepaid_php             numeric(12, 2),
  status                  internet_res_status not null default 'requested',
  set_by_admin_id         uuid references public.admin_users(id) on delete set null,
  notes                   text,
  created_at              timestamptz not null default now()
);
create index if not exists internet_reservations_member_idx
  on public.internet_reservations (member_id, requested_start desc);
create index if not exists internet_reservations_branch_idx
  on public.internet_reservations (branch_id, status);

-- Orders (advance + onsite) ---------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  type                order_type not null default 'advance',
  branch_id           uuid not null references public.branches(id) on delete restrict,
  customer_name       text not null,
  customer_phone      text,
  customer_email      text,
  total_php           numeric(12, 2) not null,
  status              order_status not null default 'placed',
  scheduled_for       timestamptz,
  payment_status      payment_status not null default 'unpaid',
  paymongo_intent_id  text,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists orders_branch_status_idx
  on public.orders (branch_id, status, created_at desc);

create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  menu_item_id    uuid references public.menu_items(id) on delete set null,
  name_snapshot   text not null,
  price_snapshot  numeric(12, 2) not null,
  qty             integer not null default 1,
  line_total      numeric(12, 2) generated always as (price_snapshot * qty) stored
);

-- Airbnb calendars ------------------------------------------------------------
create table if not exists public.airbnb_calendars (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references public.branches(id) on delete cascade,
  ical_url         text not null,
  label            text,
  last_synced_at   timestamptz,
  last_sync_error  text
);

-- Chat ------------------------------------------------------------------------
create table if not exists public.chat_conversations (
  id                     uuid primary key default gen_random_uuid(),
  customer_session_token text unique,
  customer_name          text,
  customer_phone         text,
  customer_email         text,
  branch_id              uuid references public.branches(id) on delete set null,
  status                 text not null default 'open',
  assigned_admin_id      uuid references public.admin_users(id) on delete set null,
  last_message_at        timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_type     chat_sender not null,
  sender_id       uuid,
  body            text not null,
  attachment_url  text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists chat_messages_conv_idx
  on public.chat_messages (conversation_id, created_at);

-- Admin device tokens (FCM) ---------------------------------------------------
create table if not exists public.admin_devices (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid not null references public.admin_users(id) on delete cascade,
  fcm_token       text not null unique,
  device_label    text,
  last_seen_at    timestamptz not null default now()
);

-- PayMongo webhook idempotency ------------------------------------------------
create table if not exists public.paymongo_webhook_events (
  id                  uuid primary key default gen_random_uuid(),
  paymongo_event_id   text not null unique,
  payload             jsonb not null,
  processed_at        timestamptz not null default now()
);

-- Contact form submissions ----------------------------------------------------
create table if not exists public.contact_form_submissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  message     text not null,
  branch_id   uuid references public.branches(id) on delete set null,
  handled     boolean not null default false,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists contact_submissions_unhandled_idx
  on public.contact_form_submissions (handled, created_at desc);

-- Audit log -------------------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,
  action       text not null,        -- 'insert' | 'update' | 'delete'
  entity_type  text not null,
  entity_id    uuid,
  diff_jsonb   jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

-- updated_at trigger helper ---------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- Helper: check if current user is an admin -----------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.admin_users
    where auth_user_id = auth.uid() and is_active = true
  );
$$;

-- Useful view: published branches w/ photo count
create or replace view public.published_branches as
  select b.*,
    (select count(*) from public.branch_photos p where p.branch_id = b.id) as photo_count,
    (select count(*) from public.branch_amenities a where a.branch_id = b.id) as amenity_count
  from public.branches b
  where b.is_published = true;
