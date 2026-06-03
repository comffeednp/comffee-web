-- 0050_subscription_orders.sql
-- Tracks Partner-Cafe SaaS subscription payments (cafe -> Comffee) paid via the PLATFORM PayMongo
-- account (process.env.PAYMONGO_SECRET_KEY), QR Ph checkout. One row per checkout attempt. On the
-- paid webhook we mint a license key in the LICENSE project (ipcgyt…) and stamp it here; the POS
-- onboarding polls /api/billing/subscribe/status by this row's id and auto-activates with the key.
-- Service-role only (no client RLS grants needed — only the server routes/webhook touch it).

create table if not exists public.subscription_orders (
  id                          uuid primary key default gen_random_uuid(),
  tier                        text not null check (tier in ('basic','pancafe','ai')),
  email                       text not null,
  machine_id                  text,
  amount_php                  numeric(10,2) not null,
  status                      text not null default 'unpaid'
                                check (status in ('unpaid','paid','failed','expired')),
  paymongo_checkout_id        text,   -- cs_…  (Checkout Session id, kept for dashboard lookup)
  paymongo_payment_intent_id  text,   -- pi_…  (what the paid webhook carries — primary match key)
  paymongo_payment_id         text,   -- pay_… (audit)
  license_key                 text,   -- minted on payment (null until paid+minted)
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz
);

create index if not exists subscription_orders_pi_idx on public.subscription_orders (paymongo_payment_intent_id);
create index if not exists subscription_orders_cs_idx on public.subscription_orders (paymongo_checkout_id);

alter table public.subscription_orders enable row level security;
-- No policies: service role (webhook + billing routes) bypasses RLS; clients have no direct access.
