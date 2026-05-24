-- Full automation for the 30% / 70% partial-payment scheme.
--
-- When a guest pays only the 30% reservation fee, the remaining balance now has
-- its own PayMongo payment link. These columns let the webhook recognise that
-- second payment and let the daily sweep avoid sending the same reminder twice.
--
--   balance_paymongo_intent_id  - the PayMongo link id for the balance payment
--   balance_paymongo_payment_id - the actual payment id once it succeeds
--   balance_reminder_sent_at    - when we last emailed a "balance due" reminder
--
-- (balance_php, balance_due_date, balance_paid_at already exist — migration 0013.)
alter table public.reservations
  add column if not exists balance_paymongo_intent_id  text,
  add column if not exists balance_paymongo_payment_id text,
  add column if not exists balance_reminder_sent_at     timestamptz;
