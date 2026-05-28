-- 0035: GCash payment fields for the customer PC reservation flow (Stage 7a)
--
-- WHY: Stage 6 added the reservations_enabled switch. Stage 7 adds the actual customer-facing
-- flow — customer reserves a vacant PC, sees the partner's GCash QR + the amount, pays within
-- 5 minutes, and the partner's POS verifies the GCash receipt via existing OCR matching.
--
-- Two pieces:
-- 1) branches gets gcash_qr_url + gcash_qr_path + gcash_type — the partner's uploaded QR (from
--    the POS Reservation tab in Stage 4b). The public /reserve-pc/confirmed page renders this.
-- 2) pc_reservations gets payment_status + payment_hold_expires_at — tracks the 5-min payment
--    window separately from the existing 30-min arrival grace (`must_honor_by`).
--
-- payment_status values (text, not enum — easier to evolve):
--   'unpaid'      = just created, customer hasn't claimed payment yet (default)
--   'claim_paid'  = customer pressed "I paid" on the confirmation page (awaiting partner OCR verify)
--   'verified'    = partner's POS matched the GCash receipt → reservation is good for arrival
--   'expired'     = 5 min passed with no claim_paid → reservation released
--
-- [[comffee-saas-vision]] Stage 7a.

alter table public.branches
  add column if not exists gcash_qr_url   text,
  add column if not exists gcash_qr_path  text,
  add column if not exists gcash_type     text;   -- 'p2p' default; 'business' is TBA

alter table public.pc_reservations
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_hold_expires_at timestamptz;

-- Convenience: find reservations awaiting payment verification at a branch (the partner's POS
-- polls this small set every few seconds in Stage 7b).
create index if not exists pc_reservations_payment_pending_idx
  on public.pc_reservations (branch_id, payment_status, payment_hold_expires_at)
  where payment_status in ('unpaid', 'claim_paid');
