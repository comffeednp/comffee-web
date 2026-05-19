-- Track security deposit collected per reservation so admin knows how much to refund
alter table public.reservations
  add column if not exists security_deposit_php numeric(12,2) not null default 0;
