-- 0054_subscription_renewals.sql
-- Renewal billing for Partner-Cafe SaaS subscriptions. A renewal order EXTENDS an existing license
-- instead of minting a new key: kind='renewal' rows carry the license_key being renewed, and on the
-- paid webhook we call the renew_license RPC in the LICENSE project (ipcgyt…) — which owns the date
-- math (extend from the DUE date; an expired license restarts from now) — and stamp the returned new
-- expiry here as renewed_until. Existing rows default to kind='new' (current behaviour unchanged).

alter table public.subscription_orders
  add column if not exists kind text not null default 'new';

alter table public.subscription_orders
  add column if not exists renewed_until timestamptz;  -- new expires_at returned by renew_license (null until paid+renewed)

-- Guarded so re-running this migration is safe (ADD CONSTRAINT has no IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_orders_kind_check'
      and conrelid = 'public.subscription_orders'::regclass
  ) then
    alter table public.subscription_orders
      add constraint subscription_orders_kind_check check (kind in ('new','renewal'));
  end if;
end $$;
