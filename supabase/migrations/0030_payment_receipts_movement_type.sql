-- 0030: cash-movement photos via the website. payment_receipts already carries kind='cash_movement';
-- this adds which KIND of movement the photo is for, so the POS can attach it to the right drop /
-- pickup / expense. Null for kind='gcash'. (Same table + Realtime + RLS from 0029 — no new policy.)
alter table public.payment_receipts
  add column if not exists movement_type text;   -- 'drop' | 'pickup' | 'expense' (cash_movement only)
