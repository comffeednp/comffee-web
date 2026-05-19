-- Add pax capacity fields to branch_rates for Playcation pricing
alter table public.branch_rates
  add column if not exists max_pax           integer,
  add column if not exists extra_pax_fee_php numeric(12, 2);
