-- Per-branch latest time customers can book for that same day
alter table public.branches
  add column if not exists booking_cutoff_time time;

-- Pre-fill 10 PM for all playcation branches
update public.branches
  set booking_cutoff_time = '22:00:00'
  where type = 'playcation';
