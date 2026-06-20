-- Multi-game / multi-account cart: decouple screenshot VERIFICATION from the order. Previously the OCR
-- route created a single-game draft ORDER and the 3-try anti-abuse ladder + the "this account is verified"
-- flag lived on that order row. For an account-first cart that holds several (game, account) groups, each
-- verified on its own BEFORE any order exists, the ladder + verified-record must live per IDENTITY, not per
-- order. This table is BOTH: the per-identity OCR try-ladder AND the short-lived "this account's screenshot
-- was verified" record that /pay consumes at checkout to build the order's lines.
--
-- One row per (game, normalized accountId, tag). The row id is the opaque verifyId the storefront holds per
-- cart group and submits at checkout; /pay validates it (verified_at fresh + game/account match) and copies
-- last_screenshot_path + needs_review onto the line(s). Service-role only (no policies = locked, like the
-- other game_topup_* write tables; all writes go through getSupabaseAdmin which bypasses RLS).

create table if not exists public.game_topup_verify_attempts (
  id                 uuid primary key default gen_random_uuid(),
  game               text not null,
  account_norm       text not null,                 -- normalizeName(accountId): uppercased, alnum-only
  tag                text not null default '',       -- Riot #TAG / Genshin server / MLBB Zone ('' if none)
  tries              integer not null default 0,     -- consecutive screenshot mismatches in the current window
  block_level        integer not null default 0,     -- 0=none, 1=after first lockout (15m), 2+=24h
  blocked_until      timestamptz,                    -- lockout expiry; while > now() the route refuses (no Vision spend)
  last_screenshot_path text,                          -- PRIVATE bucket path of the most recent proof
  last_ocr_text      text,
  needs_review       boolean not null default false,  -- last pass was Vision fail-open → staff should eyeball
  verified_at        timestamptz,                     -- last successful screenshot match (null = never verified)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (game, account_norm, tag)
);

-- Lookups: by identity (the unique key handles equality) and a GC scan by recency.
create index if not exists game_topup_verify_attempts_seen_idx
  on public.game_topup_verify_attempts (updated_at);

alter table public.game_topup_verify_attempts enable row level security;
-- No policies on purpose: customer-facing reads/writes all go through the service-role key.

-- updated_at maintenance (only if the repo-wide trigger fn exists; mirrors 0059's conditional pattern).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists game_topup_verify_attempts_set_updated on public.game_topup_verify_attempts;
    create trigger game_topup_verify_attempts_set_updated
      before update on public.game_topup_verify_attempts
      for each row execute function public.set_updated_at();
  end if;
end $$;
