-- 0028: Roster mirror for the reliever button. The work schedule lives in the POS; this table is a
-- one-way copy (POS → cloud, service-role writes only, same pattern as the PC-seating sync) so the
-- website can decide WHEN to show "covering for an absent co-worker": it needs to know who is
-- scheduled today and — cross-referenced with attendance_records — who hasn't clocked in.
--
-- One row per staff per day. The POS REPLACES a branch+date set (delete then insert) whenever the
-- roster changes or on sync. shift_start/shift_end are local 'HH:MM' (overnight = end < start).
create table if not exists public.staff_shifts (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  staff_id    uuid not null references public.branch_staff(id) on delete cascade,
  date        date not null,
  shift_start text,
  shift_end   text,
  unique (staff_id, date)
);
create index if not exists staff_shifts_branch_date_idx on public.staff_shifts (branch_id, date);

alter table public.staff_shifts enable row level security;
-- Staff read their own branch's roster (powers the reliever button); admins all; writes = service role.
drop policy if exists staff_shifts_branch_read on public.staff_shifts;
create policy staff_shifts_branch_read on public.staff_shifts
  for select using (
    exists (select 1 from public.branch_staff s
            where s.branch_id = staff_shifts.branch_id and s.auth_user_id = auth.uid())
  );
drop policy if exists staff_shifts_admin_all on public.staff_shifts;
create policy staff_shifts_admin_all on public.staff_shifts
  for all using (public.is_admin()) with check (public.is_admin());
