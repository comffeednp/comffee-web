-- =============================================================
-- PC stations + PC reservations
--
-- Mirror of PanCafe TERMINALS pushed by the pancafe-sync script
-- running on COMFFEE-SERVER, plus customer reservation requests.
--
-- The website never reaches the cafe server directly. Sync is
-- one-way push (cafe → Supabase) every ~10 seconds. Reservations
-- flow the other way: customer creates a row here, sync script
-- pulls it and notifies the cashier.
-- =============================================================

do $$ begin
  create type pc_reservation_status as enum (
    'pending',     -- customer created, cashier hasn't seen yet
    'acknowledged',-- cashier saw it (POS sync marks it)
    'honored',     -- customer arrived, session started in PanCafe
    'expired',     -- customer didn't show within grace window
    'cancelled'    -- explicitly cancelled
  );
exception when duplicate_object then null; end $$;

-- Live PC station state ------------------------------------------------------
create table if not exists public.pc_stations (
  id                            uuid primary key default gen_random_uuid(),
  branch_id                     uuid not null references public.branches(id) on delete cascade,
  station_name                  text not null,         -- e.g. "PC-01"
  is_occupied                   boolean not null default false,
  -- Mirrored from PanCafe TERMINALS
  raw_terminal_status           integer,
  current_session_started_at    timestamptz,           -- best-effort: today's date + STARTTIME
  current_session_member_id     integer,               -- PanCafe member id; null/0 = walk-in
  current_session_amount_php    numeric(12, 2),
  -- Sync metadata
  last_synced_at                timestamptz not null default now(),
  -- Optional display ordering
  sort_order                    integer not null default 0,
  constraint pc_stations_branch_name_unique unique (branch_id, station_name)
);

create index if not exists pc_stations_branch_idx on public.pc_stations (branch_id, station_name);

-- Customer-created reservation requests --------------------------------------
create table if not exists public.pc_reservations (
  id                      uuid primary key default gen_random_uuid(),
  branch_id               uuid not null references public.branches(id) on delete cascade,
  station_name            text,                  -- specific PC, or NULL = "any PC"
  customer_name           text not null,
  customer_phone          text,
  customer_email          text,
  member_id               uuid references public.members(id) on delete set null,
  reserved_for_start      timestamptz not null,
  reserved_for_end        timestamptz not null,
  duration_minutes        integer not null,
  status                  pc_reservation_status not null default 'pending',
  notes                   text,
  -- Lifecycle
  created_at              timestamptz not null default now(),
  acknowledged_at         timestamptz,            -- when sync script pulled it
  honored_at              timestamptz,
  honored_by_admin_id     uuid references public.admin_users(id) on delete set null,
  cancelled_at            timestamptz,
  -- Light invariant: end after start, sane duration
  constraint pc_reservations_time_check check (reserved_for_end > reserved_for_start),
  constraint pc_reservations_duration_check check (duration_minutes between 15 and 720)
);

create index if not exists pc_reservations_branch_status_idx
  on public.pc_reservations (branch_id, status, reserved_for_start);
create index if not exists pc_reservations_member_idx
  on public.pc_reservations (member_id, created_at desc);

-- RLS ------------------------------------------------------------------------
alter table public.pc_stations enable row level security;
alter table public.pc_reservations enable row level security;

-- pc_stations: public read (live vacancy is public info), admin write
drop policy if exists pc_stations_public_read on public.pc_stations;
create policy pc_stations_public_read on public.pc_stations
  for select using (
    exists (select 1 from public.branches b where b.id = branch_id and b.is_published)
  );

drop policy if exists pc_stations_admin_all on public.pc_stations;
create policy pc_stations_admin_all on public.pc_stations
  for all using (public.is_admin()) with check (public.is_admin());

-- pc_reservations: admin full, member sees own, public can insert via service role
drop policy if exists pc_reservations_admin_all on public.pc_reservations;
create policy pc_reservations_admin_all on public.pc_reservations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pc_reservations_member_self on public.pc_reservations;
create policy pc_reservations_member_self on public.pc_reservations
  for select using (
    public.is_admin() or
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );

-- Realtime: enable on pc_stations so the website can subscribe to live updates
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pc_stations'
  ) then
    alter publication supabase_realtime add table public.pc_stations;
  end if;
exception when others then
  -- Publication may not exist on a fresh project — Supabase creates it on first
  -- Realtime use. The sync script will work either way; this is a nice-to-have.
  null;
end $$;

-- Audit triggers (these tables are admin-managed)
do $$
declare
  t text;
  audit_tables text[] := array['pc_stations','pc_reservations'];
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
