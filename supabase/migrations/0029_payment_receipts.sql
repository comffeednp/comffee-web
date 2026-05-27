-- 0029: Online payment (GCash) receipts uploaded from the website clock-in page — replacing the
-- in-shop QR scanner AND its 3-second cloud poll (the invocations/egress drain).
--
-- Flow: a clocked-in cashier taps "Upload Online Payment Receipts" → the photo lands here → the POS
-- is PUSHED the new row via Realtime (one always-open connection per branch, NO polling), downloads
-- the image, runs OCR + dedup + cash reconciliation LOCALLY against that cashier's open shift, then
-- DELETES the row + image so cloud storage/egress stay near-zero. A Close-Shift pull is the fallback
-- if a push is ever missed (network blip). Service-role writes only (the website upload route + the
-- POS); no public/anon writes — mirrors 0026's attendance tables.

create table if not exists public.payment_receipts (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  staff_id    uuid references public.branch_staff(id) on delete set null,  -- the clocked-in cashier who uploaded
  kind        text not null default 'gcash',   -- 'gcash' receipt | 'cash_movement' photo (drop/pickup)
  image_path  text not null,                   -- path in the PRIVATE 'payment-receipts' storage bucket
  status      text not null default 'pending', -- pending → POS pulls it → row+image deleted; 'error' if it failed
  created_at  timestamptz not null default now(),
  pulled_at   timestamptz
);
create index if not exists payment_receipts_branch_idx
  on public.payment_receipts (branch_id, status, created_at);

alter table public.payment_receipts enable row level security;
-- Staff read their own uploads (to show "uploaded ✓"); admins all; writes = service role only.
drop policy if exists payment_receipts_self_read on public.payment_receipts;
create policy payment_receipts_self_read on public.payment_receipts
  for select using (
    exists (select 1 from public.branch_staff s
            where s.id = staff_id and s.auth_user_id = auth.uid())
  );
drop policy if exists payment_receipts_admin_all on public.payment_receipts;
create policy payment_receipts_admin_all on public.payment_receipts
  for all using (public.is_admin()) with check (public.is_admin());

-- PUSH, not poll: let the POS SUBSCRIBE to new rows over Realtime so a receipt appears the instant
-- it's uploaded — one connection per branch, no 3-second loop. This is what replaces the old
-- per-QR cloud poll that burned your invocations + egress.
alter publication supabase_realtime add table public.payment_receipts;
