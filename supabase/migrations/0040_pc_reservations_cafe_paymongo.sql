-- 0040: PayMongo cafe-reservation fields on pc_reservations
--
-- WHY: Chunk 6 adds a SECOND payment path for in-cafe PC reservations. The existing path (0035)
-- is the GCash-receipt-photo flow (customer scans a static QR, taps "I paid", cashier OCR-verifies).
-- The new path uses the owner's PayMongo account: the customer pays a hosted PayMongo checkout
-- (₱10 flat fee + PC time / member top-up), PayMongo's webhook tells us it's paid, and we hand the
-- cashier a short reservation CODE to look up on arrival.
--
-- All columns are ADDITIVE + NULLABLE so the existing GCash-photo flow and the Playcation flow are
-- completely untouched. A row only uses these when the branch's online_payment_method = 'paymongo'.
--
-- Columns (cross-repo contract — the POS reads reservation_code + member fields on arrival):
--   reservation_code   short human code (6 uppercase alnum) the cashier types in to find the booking
--   service_fee        the flat ₱10 reservation fee charged on this booking (audit / display)
--   member_topup       the top-up amount a member paid (PanCafe loads this BASE amount, then applies
--                      its own bonus — we never store or apply the bonus here)
--   member_first_name  optional, shown to the cashier to confirm WHO the member is on arrival
--   member_last_name   optional, same
--
-- PayMongo plumbing (NOT in the original 5-column contract, but REQUIRED so the webhook can find
-- this reservation when PayMongo calls back — mirrors how reservations/member_topups already store
-- their intent + payment ids):
--   paymongo_intent_id   the Payment Link id we created (lookup key in the webhook)
--   paymongo_payment_id  the actual payment id captured from the paid webhook (audit)
--
-- [[comffee-saas-vision]] Online Payments & Reservations — Chunk 6 (website side).

alter table public.pc_reservations
  add column if not exists reservation_code   text,
  add column if not exists service_fee        numeric not null default 0,
  add column if not exists member_topup       numeric not null default 0,
  add column if not exists member_first_name  text,
  add column if not exists member_last_name   text,
  add column if not exists paymongo_intent_id  text,
  add column if not exists paymongo_payment_id text;

-- reservation_code must be unique so the cashier never has two live bookings sharing a code.
-- Partial unique index (only where the code is set) keeps the existing photo-flow rows — which
-- have a NULL code — out of the constraint.
create unique index if not exists pc_reservations_reservation_code_uidx
  on public.pc_reservations (reservation_code)
  where reservation_code is not null;

-- Webhook lookup: find the reservation by the PayMongo Payment Link id when PayMongo calls back.
create index if not exists pc_reservations_paymongo_intent_idx
  on public.pc_reservations (paymongo_intent_id)
  where paymongo_intent_id is not null;
