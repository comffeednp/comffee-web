-- Branch-scoped partners: a partner only sees the branch assigned here.
-- NULL for owner/staff (they see all branches).
alter table public.admin_users
  add column if not exists branch_id uuid references public.branches(id) on delete set null;
