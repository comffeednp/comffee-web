-- 0043: backfill the branch_rates columns that migration 0006 never applied to the live website DB.
--
-- WHY (owner hit it 2026-06-01): the reserve-PC page showed NO rates for walk-ins. Root cause — the
-- live website branch_rates table is MISSING the columns the booking query filters on. lib/branch-rates.ts
-- selects WHERE is_reservable_online = true and reads pc_tier / duration_minutes / time_window_*, but
-- those columns don't exist on the live DB (0006 applied only partially, same gap that bit 0041). So the
-- query returned nothing → no rates appeared. This adds the columns (idempotent, matches 0006 exactly)
-- and BACKFILLS them so existing rates become reservable + correctly tiered.

-- 1) Add the columns (no-ops if 0006 already ran). Definitions identical to 0006.
alter table public.branch_rates
  add column if not exists pc_tier text;
alter table public.branch_rates
  add column if not exists duration_minutes integer;
alter table public.branch_rates
  add column if not exists time_window_start text;
alter table public.branch_rates
  add column if not exists time_window_end text;
alter table public.branch_rates
  add column if not exists is_reservable_online boolean not null default true;

-- 2) Tag tier from the rate label (owner 2026-06-01: "tag rates by name, PCs later"). Labels look like
--    "Regular · 1 Hour" / "VIP · Member Rate". Only set where still NULL so a future manual edit sticks.
update public.branch_rates
  set pc_tier = 'vip'
  where category = 'internet' and pc_tier is null and label ilike 'vip%';
update public.branch_rates
  set pc_tier = 'regular'
  where category = 'internet' and pc_tier is null and label ilike 'regular%';

-- 3) duration_minutes: hourly rates bill per 60 min. Only fill where NULL so existing packs (which 0006
--    may have set) are untouched. Packs without a value default to 60 too (one "unit" = the booked block);
--    the booking multiplies by quantity only for unit='hour', so a pack stays a single block regardless.
update public.branch_rates
  set duration_minutes = 60
  where category = 'internet' and duration_minutes is null;

-- 4) Make every existing internet rate reservable online (owner: show ALL rates incl. Member Rate).
--    The column already defaults true for NEW rows; this catches any pre-existing row that came in false.
update public.branch_rates
  set is_reservable_online = true
  where category = 'internet' and is_reservable_online is distinct from true;
