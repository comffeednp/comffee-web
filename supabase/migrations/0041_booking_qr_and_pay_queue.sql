-- 0041: carry the owner's Bookings QR to the website + serialize same-amount reservation payments,
--       AND backfill the pc_reservations columns that migration 0006 never applied to the website DB.
--
-- WHY (DIY-QR online reservations, 2026-05-30): online PC reservations now use the SAME mechanism as
-- the counter — the customer scans the owner's uploaded PayMongo "Bookings" QR with the amount baked
-- in, and the POS confirms by WATCHING PayMongo (no Payment-Link API, no webhook).
--
-- BACKFILL (added 2026-05-30 after a live probe): the website DB was found MISSING the pc_reservations
-- columns that 0006 adds — total_php, customer_type, rate_id, rate_quantity, member_number, must_honor_by
-- (0006 didn't fully apply there). That made the unique index below — which references total_php — fail,
-- and because the whole file runs as one transaction, it rolled back the booking_qr columns too. We add
-- those columns here (idempotent) BEFORE the index so this migration stands on its own. Definitions match
-- 0006 exactly. (member_topups table is also missing on the website DB, but the DIY reservation flow
-- stores the member top-up on pc_reservations.member_topup, so it isn't needed here.)
alter table public.pc_reservations
  add column if not exists customer_type  text not null default 'walk_in',  -- 'walk_in' | 'member'
  add column if not exists rate_id        uuid references public.branch_rates(id) on delete set null,
  add column if not exists member_number  text,
  add column if not exists rate_quantity  integer not null default 1,
  add column if not exists total_php      numeric(12, 2),
  add column if not exists must_honor_by  timestamptz;

-- 1) branch_payment_config gets booking_qr_tlv + booking_qr_codeid — the raw EMVCo string of the owner's
--    Bookings QR Ph (the POS decodes the uploaded photo and syncs it here). NOT a secret: it is literally
--    what gets drawn into the QR the customer scans. The website reads it server-side and builds each
--    booking's dynamic QR (flip POI 11->12, inject the amount, recompute CRC — ported to TS in lib/qrph.ts).
alter table public.branch_payment_config
  add column if not exists booking_qr_tlv     text,
  add column if not exists booking_qr_codeid  text;

-- 2) PARTIAL UNIQUE INDEX so only ONE reservation per (branch, exact total) can be 'awaiting' (active
--    pay-window) at a time — the payment QUEUE. The POS matches a PayMongo payment to a reservation BY
--    AMOUNT, so two same-amount reservations awaiting at once would be ambiguous. This index makes the
--    "claim a pay slot" UPDATE atomic — the second same-amount claimant hits the constraint and waits.
--    DIY-QR payment_status flow: 'queued' -> 'awaiting' -> 'paid' (POS) | 'expired'.
create unique index if not exists pc_reservations_one_awaiting_per_amount
  on public.pc_reservations (branch_id, total_php)
  where payment_status = 'awaiting';
