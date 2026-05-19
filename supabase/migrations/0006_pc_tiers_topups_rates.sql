-- =============================================================
-- PC tiers + rate metadata + member top-ups
--
-- Adds:
--   - pc_tier column to pc_stations (regular | vip, set by admin)
--   - Rate metadata on branch_rates: pc_tier, duration_minutes,
--     time_window_start/end (for night promos), is_reservable_online
--   - pc_reservations fields for rate/member/quantity/must_honor_by
--   - member_topups table for the C2 top-up flow
-- =============================================================

-- branch_rates: tier filter + duration + time window ------------------------
alter table public.branch_rates
  add column if not exists pc_tier text;        -- 'regular' | 'vip' | null (applies to both)
alter table public.branch_rates
  add column if not exists duration_minutes integer;
alter table public.branch_rates
  add column if not exists time_window_start text;  -- 'HH:MM' 24h, null = any time
alter table public.branch_rates
  add column if not exists time_window_end text;    -- 'HH:MM' 24h, null = any time
alter table public.branch_rates
  add column if not exists is_reservable_online boolean not null default true;

-- pc_stations: tier tag (admin sets manually after first sync) ---------------
alter table public.pc_stations
  add column if not exists pc_tier text;         -- 'regular' | 'vip' | null

-- pc_reservations: rate/member/honor deadline -------------------------------
alter table public.pc_reservations
  add column if not exists customer_type text not null default 'walk_in';  -- 'walk_in' | 'member'
alter table public.pc_reservations
  add column if not exists rate_id uuid references public.branch_rates(id) on delete set null;
alter table public.pc_reservations
  add column if not exists member_number text;
alter table public.pc_reservations
  add column if not exists rate_quantity integer not null default 1;
alter table public.pc_reservations
  add column if not exists total_php numeric(12, 2);
alter table public.pc_reservations
  add column if not exists must_honor_by timestamptz;

create index if not exists pc_reservations_must_honor_by_idx
  on public.pc_reservations (must_honor_by)
  where status in ('pending', 'acknowledged');

-- member_topups: C2 top-up flow ---------------------------------------------
do $$ begin
  create type topup_payment_status as enum ('unpaid', 'pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type topup_fulfillment_status as enum ('pending', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.member_topups (
  id                      uuid primary key default gen_random_uuid(),
  branch_id               uuid not null references public.branches(id) on delete cascade,
  member_number           text not null,
  customer_name           text,
  customer_email          text,
  customer_phone          text,
  amount_php              numeric(12, 2) not null,
  paymongo_intent_id      text,
  paymongo_payment_id     text,
  payment_status          topup_payment_status not null default 'unpaid',
  fulfillment_status      topup_fulfillment_status not null default 'pending',
  fulfilled_by_admin_id   uuid references public.admin_users(id) on delete set null,
  fulfilled_at            timestamptz,
  notes                   text,
  created_at              timestamptz not null default now(),
  constraint member_topups_amount_check check (amount_php > 0)
);

create index if not exists member_topups_branch_fulfillment_idx
  on public.member_topups (branch_id, fulfillment_status, created_at desc);
create index if not exists member_topups_member_idx
  on public.member_topups (member_number, created_at desc);
create index if not exists member_topups_intent_idx
  on public.member_topups (paymongo_intent_id);

-- RLS ------------------------------------------------------------------------
alter table public.member_topups enable row level security;

drop policy if exists member_topups_admin_all on public.member_topups;
create policy member_topups_admin_all on public.member_topups
  for all using (public.is_admin()) with check (public.is_admin());

-- Public read own top-up by id (for the confirmation page, rate-limited endpoint)
drop policy if exists member_topups_public_service_only on public.member_topups;
-- Intentionally NO public read — the /topup/confirmed page uses the service role
-- and matches by id + payment ref. Direct client reads go through RLS which
-- blocks them. No public select policy = no public access.

-- Audit trigger -------------------------------------------------------------
do $$
declare
  t text;
  audit_tables text[] := array['member_topups'];
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

-- Seed: Lagro rates so the user can see it work immediately ------------------
do $$
declare
  lagro_id uuid;
begin
  select id into lagro_id from public.branches where slug = 'lagro' limit 1;
  if lagro_id is null then
    -- Lagro branch doesn't exist yet — skip seed, the user can add it later
    return;
  end if;

  -- Clear any existing internet-category rates for Lagro so re-running is idempotent
  delete from public.branch_rates
    where branch_id = lagro_id and category = 'internet';

  -- Regular PCs
  insert into public.branch_rates
    (branch_id, category, label, description, price_php, unit, sort_order,
     pc_tier, duration_minutes, time_window_start, time_window_end, is_reservable_online)
  values
    (lagro_id, 'internet', 'Regular ₱30/hr', 'Per-hour rate for regular PCs',
     30, 'hour', 1, 'regular', 60, null, null, true),
    (lagro_id, 'internet', 'Regular 3hr All-Day Promo', '3 hours for ₱55',
     55, 'pack', 2, 'regular', 180, null, null, true),
    (lagro_id, 'internet', 'Regular 8hr Night Promo', '8 hours for ₱100, 10pm–6am only',
     100, 'pack', 3, 'regular', 480, '22:00', '06:00', true),
    -- VIP PCs
    (lagro_id, 'internet', 'VIP ₱40/hr', 'Per-hour rate for VIP PCs',
     40, 'hour', 4, 'vip', 60, null, null, true),
    (lagro_id, 'internet', 'VIP 3hr All-Day Promo', '3 hours for ₱90',
     90, 'pack', 5, 'vip', 180, null, null, true),
    (lagro_id, 'internet', 'VIP 5hr Night Promo', '5 hours for ₱100, 10pm–6am only',
     100, 'pack', 6, 'vip', 300, '22:00', '06:00', true);
end $$;
