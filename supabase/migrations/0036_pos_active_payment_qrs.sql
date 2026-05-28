-- 0036: in-store dynamic GCash QR — one row per active checkout
--
-- Per-transaction state for the in-store payment flow ([[gcash-dynamic-qr-phase1]] — no landing
-- page; cashier still photographs the customer's receipt). POS writes a row when the cashier
-- hits GCash; the cashier's clock-in page picks it up via Realtime and reveals a full-screen QR;
-- the customer scans from inside GCash (raw EMVCo, not a URL), pays, shows their success screen
-- to the cashier; cashier uploads the photo via the existing receipt-upload flow; POS-side OCR
-- matches the photo's text against this row's UNIQUE NICKNAME (tag 59 of the EMVCo QR), flips
-- 'pending' → 'received', auto-completes the order, and the clock-in page hides the QR.
--
-- Status lifecycle:
--   'pending'    = QR live, awaiting cashier-uploaded receipt photo
--   'received'   = OCR matched nickname + amount → POS auto-completed the order
--   'expired'    = 5-min window elapsed → POS regenerates a fresh row + nickname
--   'cancelled'  = cashier voided the QR mid-flow (rare)
--
-- Single-use: once 'received' or 'expired', tryMatchActivePaymentQr no longer considers the row.
-- Old rows stay for audit. Nickname is unique-per-txn so receipts that arrive late can still
-- match the correct (most recent) row.
--
-- branch_id + shift_id + cashier_staff_id are the Realtime subscription key on the clock-in page
-- (one cashier sees only their own active QRs).

create table if not exists public.pos_active_payment_qrs (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references public.branches(id) on delete cascade,
  shift_id          integer not null,                  -- POS-side cash_shifts.id (not a website FK)
  cashier_staff_id  uuid references public.branch_staff(id) on delete set null,
  order_id          text,                              -- POS-side orders.id; null until linked

  amount            numeric(12, 2) not null check (amount > 0),
  nickname          text not null,                     -- 10-char EMVCo tag 59 — UNIQUE per row; OCR match key
  qr_image_url      text not null,                     -- public URL to the rendered PNG in Storage

  expires_at        timestamptz not null,              -- now() + 5 min at insert
  status            text not null default 'pending'
                      check (status in ('pending', 'received', 'expired', 'cancelled')),

  -- Set when match fires (Chunk B's tryMatchActivePaymentQr in main.js).
  matched_receipt_id  integer,                         -- POS-side gcash_receipts.id (audit link)
  received_at         timestamptz,
  cancelled_at        timestamptz,
  cancelled_reason    text,

  created_at        timestamptz not null default now()
);

-- Realtime filter index — clock-in page listens for (branch, shift, cashier) pending rows.
-- Partial index keeps it tiny + fast.
create index if not exists pos_active_payment_qrs_active_idx
  on public.pos_active_payment_qrs (branch_id, shift_id, cashier_staff_id, status)
  where status = 'pending';

-- Lookup by nickname (the OCR auto-match key in processGcashUpload). Partial — once a row hits
-- 'received' it's done, no point indexing.
create index if not exists pos_active_payment_qrs_nickname_idx
  on public.pos_active_payment_qrs (branch_id, nickname)
  where status = 'pending';

-- Realtime publication — Supabase needs the table added to supabase_realtime publication so the
-- clock-in page subscription works.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.pos_active_payment_qrs;
    exception when duplicate_object then null;
    end;
  end if;
end$$;

-- RLS: locked down. Only the service-role key writes (POS via Stage 4b's `WEBSITE_SUPABASE_KEY`),
-- and the clock-in page's Realtime channel uses a server-side subscription. The anon key has no
-- read/write. No public select policy.
alter table public.pos_active_payment_qrs enable row level security;
