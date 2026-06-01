-- 0044: store the PayMongo Payment Intent id (pi_) on a booking so the paid webhook can find it.
--
-- WHY (the real confirm bug, owner hit it twice 2026-06-01): the booking stored the Checkout Session
-- id (cs_) in paymongo_intent_id, but the paid webhook (payment.paid) carries the PAYMENT INTENT id
-- (pi_) at data.attributes.data.attributes.payment_intent_id -- NOT the cs_. So the webhook's booking
-- lookup (match paymongo_intent_id == inner.id) NEVER matched, and paid bookings never confirmed.
-- Proven: a real paid booking's webhook pi_ == the checkout session's payment_intent.id.
--
-- Fix: store the pi_ here at checkout-create time; the webhook matches on it. Additive + nullable, so
-- existing rows and every other flow are untouched.

alter table public.pc_reservations
  add column if not exists paymongo_payment_intent_id text;

-- Webhook lookup index (only where set).
create index if not exists pc_reservations_paymongo_pi_idx
  on public.pc_reservations (paymongo_payment_intent_id)
  where paymongo_payment_intent_id is not null;
