-- 0027: Reliever-for-absent. A clock-IN can record WHO the worker is covering for (a sudden
-- absence) — chosen on the website clock-in screen. The POS reads this so that when an admin
-- "Approve shift"s the reliever's unscheduled clock-in, it uses the ABSENT person's scheduled
-- hours (and records who covered whom) instead of the raw punch times.
--
-- Null = a normal clock-in (not covering anyone). Writes are service-role only (the /clock route);
-- 0026 already set attendance_records RLS (read-own / admin-all, no client write), which covers
-- this column too — so no new policy is needed here.
alter table public.attendance_records
  add column if not exists covering_for_staff_id uuid references public.branch_staff(id) on delete set null;
