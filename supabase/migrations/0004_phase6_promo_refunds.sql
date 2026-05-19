-- =============================================================
-- Phase 6: promo codes, refunds, audit log support
-- =============================================================

-- ENUMs ----------------------------------------------------------------------
do $$ begin
  create type promo_discount_type as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type promo_applies_to as enum ('order', 'reservation', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type refund_status as enum ('pending', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

-- Promo codes ----------------------------------------------------------------
create table if not exists public.promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  description     text,
  discount_type   promo_discount_type not null,
  discount_value  numeric(12, 2) not null,
  applies_to      promo_applies_to not null default 'both',
  min_amount_php  numeric(12, 2),
  max_uses        integer,
  used_count      integer not null default 0,
  valid_from      timestamptz,
  valid_until     timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  -- store codes case-insensitively
  constraint promo_codes_code_unique unique (code)
);

-- Index for case-insensitive lookups
create index if not exists promo_codes_code_lower_idx on public.promo_codes (lower(code));

-- Promo redemptions (links a code use to an order or reservation)
create table if not exists public.promo_code_redemptions (
  id              uuid primary key default gen_random_uuid(),
  promo_code_id   uuid not null references public.promo_codes(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete set null,
  reservation_id  uuid references public.reservations(id) on delete set null,
  discount_php    numeric(12, 2) not null,
  redeemed_at     timestamptz not null default now(),
  constraint promo_redemption_target check (
    (order_id is not null) or (reservation_id is not null)
  )
);
create index if not exists promo_redemptions_code_idx
  on public.promo_code_redemptions (promo_code_id, redeemed_at desc);

-- Refunds --------------------------------------------------------------------
create table if not exists public.refunds (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid references public.orders(id) on delete set null,
  reservation_id        uuid references public.reservations(id) on delete set null,
  paymongo_refund_id    text unique,
  amount_php            numeric(12, 2) not null,
  reason                text,
  status                refund_status not null default 'pending',
  created_by_admin_id   uuid references public.admin_users(id) on delete set null,
  created_at            timestamptz not null default now(),
  refunded_at           timestamptz,
  constraint refund_target check (
    (order_id is not null) or (reservation_id is not null)
  )
);
create index if not exists refunds_order_idx on public.refunds (order_id);
create index if not exists refunds_reservation_idx on public.refunds (reservation_id);

-- Add discount tracking + payment id to orders / reservations ----------------
alter table public.orders
  add column if not exists discount_php numeric(12, 2) not null default 0;
alter table public.orders
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.orders
  add column if not exists paymongo_payment_id text;

alter table public.reservations
  add column if not exists discount_php numeric(12, 2) not null default 0;
alter table public.reservations
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.reservations
  add column if not exists paymongo_payment_id text;

-- RLS ------------------------------------------------------------------------
alter table public.promo_codes              enable row level security;
alter table public.promo_code_redemptions   enable row level security;
alter table public.refunds                  enable row level security;

drop policy if exists promo_codes_admin_all on public.promo_codes;
create policy promo_codes_admin_all on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists promo_redemptions_admin_all on public.promo_code_redemptions;
create policy promo_redemptions_admin_all on public.promo_code_redemptions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists refunds_admin_all on public.refunds;
create policy refunds_admin_all on public.refunds
  for all using (public.is_admin()) with check (public.is_admin());

-- Audit triggers for new tables ---------------------------------------------
do $$
declare
  t text;
  audit_tables text[] := array['promo_codes'];
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
