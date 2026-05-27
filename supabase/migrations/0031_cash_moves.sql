-- 0031: cash moves (drop / pickup / expense) entered + approved on the WEBSITE, then pulled into the
-- POS — replaces the in-POS Cash Drop/Pickup/Expense entry. Flow: the worker enters type + amount +
-- reason (+ optional photo) on the clock-in page → a 6-digit code is emailed to the owner → the worker
-- types the code back → once approved the POS downloads the move and records it into that worker's open
-- shift (no second POS approval; giving the code WAS the approval).
--
-- SECURITY: all access is via the service-role API routes only. RLS is ON with NO public/anon policies,
-- so the public (anon/authenticated) key can NEVER read this table — critically it can't read
-- approval_code and self-approve. The service role bypasses RLS, which is how the routes read/write it.
create table if not exists public.cash_moves (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id) on delete cascade,
  staff_id      uuid not null references public.branch_staff(id) on delete cascade,
  type          text not null check (type in ('drop', 'pickup', 'expense')),
  amount        numeric(12, 2) not null check (amount > 0),
  reason        text not null,
  image_path    text,                                  -- optional photo in the payment-receipts bucket
  status        text not null default 'pending_code'   -- pending_code → approved → pulled
                  check (status in ('pending_code', 'approved', 'pulled')),
  approval_code text not null,                          -- 6-digit; never exposed to the client (RLS)
  created_at    timestamptz not null default now(),
  approved_at   timestamptz,
  pulled_at     timestamptz
);

alter table public.cash_moves enable row level security;
-- (intentionally NO policies → only the service role can touch this table; public key is denied)

-- The POS pulls per branch where status='approved'; this index keeps that lookup fast.
create index if not exists cash_moves_branch_status_idx on public.cash_moves (branch_id, status);
