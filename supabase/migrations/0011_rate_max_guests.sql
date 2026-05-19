-- Hard guest cap per rate (e.g. Overnight allows max 4 guests total)
alter table public.branch_rates
  add column if not exists max_guests integer;
