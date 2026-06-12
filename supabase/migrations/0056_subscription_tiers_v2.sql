-- 0056: the 2026-06-12 package model — free / seating ₱299 / pos ₱599 / ai ₱799.
-- 'free' is never billed (no subscription order exists for it), so it is NOT in
-- the check. New paid ids: 'seating' and 'ai' ('pos' already passed). Every
-- legacy id stays accepted so pre-model installers/renewals keep working.
alter table public.subscription_orders
  drop constraint subscription_orders_tier_check;
alter table public.subscription_orders
  add constraint subscription_orders_tier_check
  check (tier in ('seating', 'pos', 'ai', 'clockwork', 'unified', 'basic', 'pancafe'));
