-- 0034: per-branch "accept online reservations" switch
--
-- WHY: each branch owner decides whether to accept online PC reservations or run walk-in-only.
-- When OFF, the public branch page hides the "Reserve a PC" button + shows a walk-in note; the
-- vacant-PC live view stays (customers can still SEE what's free, just can't book ahead).
-- The reservation create endpoint also checks this flag so a deep-link can't bypass.
--
-- DEFAULT FALSE — owners opt IN explicitly. Safer for partners who aren't ready to accept money
-- (GCash QR + workflow); also matches Lagro/SJDM's current walk-in posture.
--
-- [[comffee-saas-vision]] Stage 6.

alter table public.branches
  add column if not exists reservations_enabled boolean not null default false;

-- Small index for the public page check (cheap; most queries filter by slug, this is for the
-- occasional "all open-for-reservations branches" listing if we add one later).
create index if not exists branches_reservations_idx
  on public.branches (reservations_enabled)
  where reservations_enabled = true;
