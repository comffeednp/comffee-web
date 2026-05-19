-- Support 30% partial payment scheme
alter table public.reservations
  add column if not exists payment_type    text not null default 'full',
  add column if not exists balance_php     numeric(12,2) not null default 0,
  add column if not exists balance_due_date date,
  add column if not exists balance_paid_at  timestamptz;
