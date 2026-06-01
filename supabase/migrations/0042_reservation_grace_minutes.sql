-- 0042: owner-set arrival grace (minutes) for online PC reservations.
--
-- WHY (online-bookings → PayMongo API rewrite, 2026-06-01): the arrival grace used to be a hardcoded
-- 10 minutes in the create route (CAFE_GRACE_MINUTES). The owner wants it adjustable per branch on the
-- POS admin Reservation tab. The grace HOLDS the reserved (currently-vacant) PC from booking time; at
-- grace end the paid time is considered started and the seat returns to the vacant floor (no advance
-- bookings, so a held seat never blocks the floor for long). The POS syncs this value up to
-- branch_payment_config (same row it already writes for keys/fees). NULL → the create route falls back
-- to 10 minutes, so existing branches are unaffected until the owner sets a value.
--
-- Additive + nullable: no existing flow changes.

alter table public.branch_payment_config
  add column if not exists reservation_grace_minutes integer;
