-- =============================================================
-- Phase 6 — promo codes, redemptions, refunds
-- =============================================================

do $$ begin
  create type promo_kind as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type promo_applies_to as enum ('orders', 'reservations', 'all');
exception when duplicate_object then null; end $$;

do $$ begin
  create type refund_status as enum ('pending', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type refund_source as enum ('order', 'reservation');
exception when duplicate_object then null; end $$;

-- Promo codes ----------------------------------------------------------------
create table if not exists public.promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  description     text,
  kind            promo_kind not null,
  value           numeric(12, 2) not null,         -- percent (1-100) or fixed PHP amount
  applies_to      promo_applies_to not null default 'all',
  min_amount_php  numeric(12, 2),                  -- minimum order/booking total to apply
  valid_from      timestamptz,
  valid_until     timestamptz,
  max_uses        integer,                          -- null = unlimited
  current_uses    integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists promo_codes_code_active_idx
  on public.promo_codes (code, is_active);

create table if not exists public.promo_code_redemptions (
  id               uuid primary key default gen_random_uuid(),
  promo_code_id    uuid not null references public.promo_codes(id) on delete cascade,
  applied_to_type  text not null,                  -- 'order' | 'reservation'
  applied_to_id    uuid not null,
  applied_amount   numeric(12, 2) not null,        -- absolute discount in PHP
  created_at       timestamptz not null default now()
);
create index if not exists promo_redemptions_code_idx
  on public.promo_code_redemptions (promo_code_id);
create index if not exists promo_redemptions_target_idx
  on public.promo_code_redemptions (applied_to_type, applied_to_id);

-- Refunds --------------------------------------------------------------------
create table if not exists public.refunds (
  id                    uuid primary key default gen_random_uuid(),
  source_type           refund_source not null,
  source_id             uuid not null,
  paymongo_refund_id    text,
  amount_php            numeric(12, 2) not null,
  reason                text,
  status                refund_status not null default 'pending',
  created_by_admin_id   uuid references public.admin_users(id) on delete set null,
  created_at            timestamptz not null default now(),
  succeeded_at          timestamptz
);
create index if not exists refunds_source_idx
  on public.refunds (source_type, source_id, created_at desc);

-- Add discount columns to existing tables ------------------------------------
alter table public.orders
  add column if not exists discount_php numeric(12, 2) not null default 0,
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;

alter table public.reservations
  add column if not exists discount_php numeric(12, 2) not null default 0,
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;

-- RLS ------------------------------------------------------------------------
alter table public.promo_codes              enable row level security;
alter table public.promo_code_redemptions   enable row level security;
alter table public.refunds                  enable row level security;

drop policy if exists promo_codes_admin_all on public.promo_codes;
create policy promo_codes_admin_all on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists promo_codes_public_read_active on public.promo_codes;
create policy promo_codes_public_read_active on public.promo_codes
  for select using (is_active = true);

drop policy if exists promo_redemptions_admin_all on public.promo_code_redemptions;
create policy promo_redemptions_admin_all on public.promo_code_redemptions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists refunds_admin_all on public.refunds;
create policy refunds_admin_all on public.refunds
  for all using (public.is_admin()) with check (public.is_admin());

-- Audit log triggers for new tables ------------------------------------------
do $$
declare
  t text;
  audit_tables text[] := array['promo_codes', 'refunds'];
begin
  foreach t in array audit_tables loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit
       after insert or update or delete on public.%I
       for each row execute function public.audit_row_change()',
      t, t
    );
  end loop;
end $$;
