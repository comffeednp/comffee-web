-- 0057: branch chat managers — the owner/manager emails a partner cafe authorizes
-- (from Clockwork Settings -> "Website chat managers", synced up the same channel
-- as branch_payment_config) to read + answer THEIR branch's website chat from
-- anywhere on comffee.org (/inbox), not just the staff clock-in page.
-- Mirrors the 0024/0025 branch-scope pattern: every read/reply is checked
-- server-side against this table; cross-branch access is refused.
create table if not exists public.branch_chat_managers (
  branch_id uuid not null references public.branches(id) on delete cascade,
  email text not null check (email = lower(email)),
  added_at timestamptz not null default now(),
  primary key (branch_id, email)
);

create index if not exists branch_chat_managers_email_idx
  on public.branch_chat_managers (email);

-- Service-role only (same posture as branch_payment_config): RLS on with NO
-- policies — the anon/authenticated keys can neither read the manager roster nor
-- write themselves into it. All access goes through server code / the
-- license-gated website-proxy.
alter table public.branch_chat_managers enable row level security;
