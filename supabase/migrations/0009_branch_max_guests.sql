-- Hard guest capacity per branch/unit (shown on booking form)
alter table public.branches
  add column if not exists max_guests integer;
