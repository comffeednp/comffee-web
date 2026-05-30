-- 0041: carry the owner's Bookings QR to the website + serialize same-amount reservation payments
--
-- WHY (DIY-QR online reservations, 2026-05-30): online PC reservations now use the SAME mechanism as
-- the counter — the customer scans the owner's uploaded PayMongo "Bookings" QR with the amount baked
-- in, and the POS confirms by WATCHING PayMongo (no Payment-Link API, no webhook). Two pieces:
--
-- 1) branch_payment_config gets booking_qr_tlv + booking_qr_codeid — the raw EMVCo string of the
--    owner's Bookings QR Ph (the POS decodes the uploaded photo and syncs it here). This is NOT a
--    secret: it is literally what gets drawn into the QR the customer scans. The website reads it
--    server-side and builds each booking's dynamic QR (flip POI 11->12, inject the amount, recompute
--    the CRC — the exact transform the POS uses, ported to TS in src/lib/qrph.ts).
--
-- 2) pc_reservations: a PARTIAL UNIQUE INDEX so only ONE reservation per (branch, exact total) can be
--    in the 'awaiting' (active pay-window) state at a time. This is the payment QUEUE: the POS matches
--    a PayMongo payment to a reservation BY AMOUNT, so two same-amount reservations awaiting payment at
--    once would be ambiguous. The index makes the "claim a pay slot" UPDATE atomic — the second
--    same-amount claimant hits the constraint and waits its turn. Different amounts are unaffected
--    (they pay concurrently). DIY-QR reservation payment_status flow:
--      'queued'   = created, waiting for the same-amount pay slot to free up
--      'awaiting' = active pay window (QR shown, POS watching); UNIQUE per (branch_id, total_php)
--      'paid'     = POS matched the PayMongo payment -> fires the cashier pop-up (existing contract)
--      'expired'  = pay window passed with no payment
--    (The older GCash-receipt flow's 'unpaid'/'claim_paid'/'verified' values are untouched + unused here.)

alter table public.branch_payment_config
  add column if not exists booking_qr_tlv     text,
  add column if not exists booking_qr_codeid  text;

create unique index if not exists pc_reservations_one_awaiting_per_amount
  on public.pc_reservations (branch_id, total_php)
  where payment_status = 'awaiting';
