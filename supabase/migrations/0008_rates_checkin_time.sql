-- check-in / check-out time per rate (for daycation) + reminder tracking on reservations

alter table public.branch_rates
  add column if not exists check_in_time  text,   -- e.g. '14:00'
  add column if not exists check_out_time text;   -- e.g. '12:00'

alter table public.reservations
  add column if not exists arrival_email_sent     boolean not null default false,
  add column if not exists pre_arrival_email_sent boolean not null default false;
