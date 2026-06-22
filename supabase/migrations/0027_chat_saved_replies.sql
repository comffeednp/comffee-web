-- Canned admin chat replies ("saved replies"), each with optional file
-- attachments, scoped per branch so one branch's replies don't leak into
-- another's. A null branch_id = available to all branches (shared/global).
create table if not exists public.chat_saved_replies (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid references public.branches(id) on delete cascade, -- null = all branches
  title           text not null,
  body            text not null,
  attachment_urls jsonb not null default '[]'::jsonb,  -- [{ url, label }]
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.chat_saved_replies enable row level security;

-- Admin-internal only (never customer-facing) → no public read, admin full access.
drop policy if exists chat_saved_replies_admin_all on public.chat_saved_replies;
create policy chat_saved_replies_admin_all on public.chat_saved_replies
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists chat_saved_replies_branch_idx
  on public.chat_saved_replies (branch_id, sort_order);
