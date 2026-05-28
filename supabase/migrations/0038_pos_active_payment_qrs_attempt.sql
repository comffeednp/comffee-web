-- 0038: live green/red photo-result feedback on the in-store GCash QR
--
-- Redesign 2026-05-29 (owner): the code-on-receipt match was dropped — GCash shows the cashier's
-- PERSONAL NAME as the recipient on the payer's success screen, never the per-txn code, so the
-- code could never be OCR-matched. The till now confirms a payment by amount + paid-to-this-cafe
-- + the receipt's printed time being within 5 minutes of when the QR was minted (see main.js
-- tryConfirmActivePaymentQr). The staff phone gives the cashier a GREEN/RED result right after the
-- photo is read, instead of hanging forever on a silent no-match.
--
-- These three columns carry that result back to the phone WITHOUT moving the row off 'pending'
-- (so a RED leaves the QR + 'Take Photo' button on screen for a retake; only a GREEN flips the row
-- to 'received'). The clock-in page's existing Realtime subscription (filter cashier_staff_id)
-- already pushes UPDATEs, and 0037's row-level SELECT policy already exposes the whole row to the
-- owning staffer — so no new RLS/realtime wiring is needed, just the columns.
alter table public.pos_active_payment_qrs
  add column if not exists last_attempt_at     timestamptz,
  add column if not exists last_attempt_ok     boolean,
  add column if not exists last_attempt_reason text;
