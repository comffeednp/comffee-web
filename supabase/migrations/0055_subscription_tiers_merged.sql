-- The POS<->Clockwork merge renamed the desktop product lines (2026-06-11):
-- the onboarding wizard now subscribes with pos / clockwork / unified.
-- Widen the tier check; legacy ids stay valid for pre-merge installers.
alter table public.subscription_orders
  drop constraint subscription_orders_tier_check;
alter table public.subscription_orders
  add constraint subscription_orders_tier_check
  check (tier in ('pos', 'clockwork', 'unified', 'basic', 'pancafe', 'ai'));
