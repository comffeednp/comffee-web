-- Per-branch security deposit override. Null = use app default (₱1,000).
alter table public.branches
  add column if not exists security_deposit_php numeric(12, 2);
