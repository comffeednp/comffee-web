-- 0026: Cloud attendance — per-branch staff clock-in (Google sign-in + face + geofence).
--
-- WHY this shape: the clock-in moves to the website but the OWNER manages everything
-- on the POS (approve staff, reset device, payroll). So these tables are the cloud
-- source of the *act* of clocking, and the POS syncs them DOWN into its local tables.
-- All writes go through service-role API routes ONLY — clients (anon/authenticated)
-- get read-only access to their own rows, never write. That's why there are no
-- INSERT/UPDATE policies below: the service role bypasses RLS, everyone else can't write.
-- See memory: project_cloud_attendance_rebuild.

-- ── Geofence config lives on the branch (lat/lng already exist from 0001) ──────
-- radius default 100m + "required" toggle default OFF mirror the POS defaults so
-- behaviour matches the old POS-local geofence until an admin turns it on.
alter table public.branches
  add column if not exists geofence_radius_m integer not null default 100,
  add column if not exists geofence_required boolean not null default false;

-- ── Enums ─────────────────────────────────────────────────────────────────────
do $$ begin
  create type attendance_status as enum ('pending','approved','rejected','disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_clock_type as enum ('clock_in','clock_out');
exception when duplicate_object then null; end $$;

-- ── Branch staff ───────────────────────────────────────────────────────────────
-- Self-registered via Google sign-in; stays 'pending' until a POS admin approves.
-- face_descriptor = 128-d face-api vector (null until the staff enrolls their face).
-- unique(branch_id, email): one staff record per Google email per branch.
create table if not exists public.branch_staff (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references public.branches(id) on delete cascade,
  auth_user_id    uuid,                 -- Supabase auth.users id (the Google account)
  email           text not null,        -- Google email, stored lowercased
  name            text not null,
  face_descriptor jsonb,                -- [128 floats]; null = not enrolled yet
  selfie_url      text,
  status          attendance_status not null default 'pending',
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (branch_id, email)
);
create index if not exists branch_staff_branch_status_idx
  on public.branch_staff (branch_id, status);
create index if not exists branch_staff_auth_idx
  on public.branch_staff (auth_user_id);

-- ── Device binding ──────────────────────────────────────────────────────────────
-- One active device per staff (unique staff_id). A second device is rejected at the
-- clock API. Admin "reset" = delete this row (POS writes the delete via service role),
-- letting the staff re-bind on a new phone. Mirrors the POS "Registered Phones" panel.
create table if not exists public.device_bindings (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.branch_staff(id) on delete cascade,
  device_token text not null,
  user_agent   text,
  bound_at     timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (staff_id)
);

-- ── Attendance records ──────────────────────────────────────────────────────────
-- The clock-in/out events. Synced DOWN to the POS, where the existing payroll engine
-- reads them. gps_* + distance_m + verified_ip are kept for the audit trail (same
-- fields the POS-local attendance_records had).
create table if not exists public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references public.branches(id) on delete cascade,
  staff_id         uuid not null references public.branch_staff(id) on delete cascade,
  clock_type       attendance_clock_type not null,
  recorded_at      timestamptz not null default now(),
  selfie_url       text,
  face_match_score real,
  gps_lat          numeric(10, 7),
  gps_lng          numeric(10, 7),
  gps_accuracy_m   real,
  distance_m       real,
  verified_ip      text,
  device_token     text
);
create index if not exists attendance_records_branch_idx
  on public.attendance_records (branch_id, recorded_at desc);
create index if not exists attendance_records_staff_idx
  on public.attendance_records (staff_id, recorded_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────────
-- Read-only to clients (own rows), full to admins, writes only via service role.
alter table public.branch_staff       enable row level security;
alter table public.device_bindings    enable row level security;
alter table public.attendance_records enable row level security;

-- branch_staff: a signed-in staff reads their own row (to learn approval status);
-- admins read/write all (POS admin uses service role, but is_admin covers web admin too).
drop policy if exists branch_staff_self_read on public.branch_staff;
create policy branch_staff_self_read on public.branch_staff
  for select using (auth_user_id = auth.uid());
drop policy if exists branch_staff_admin_all on public.branch_staff;
create policy branch_staff_admin_all on public.branch_staff
  for all using (public.is_admin()) with check (public.is_admin());

-- device_bindings: staff reads own binding; admin all.
drop policy if exists device_bindings_self_read on public.device_bindings;
create policy device_bindings_self_read on public.device_bindings
  for select using (
    exists (select 1 from public.branch_staff s
            where s.id = staff_id and s.auth_user_id = auth.uid())
  );
drop policy if exists device_bindings_admin_all on public.device_bindings;
create policy device_bindings_admin_all on public.device_bindings
  for all using (public.is_admin()) with check (public.is_admin());

-- attendance_records: staff reads own history; admin all.
drop policy if exists attendance_records_self_read on public.attendance_records;
create policy attendance_records_self_read on public.attendance_records
  for select using (
    exists (select 1 from public.branch_staff s
            where s.id = staff_id and s.auth_user_id = auth.uid())
  );
drop policy if exists attendance_records_admin_all on public.attendance_records;
create policy attendance_records_admin_all on public.attendance_records
  for all using (public.is_admin()) with check (public.is_admin());
