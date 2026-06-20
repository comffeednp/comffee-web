-- Hardening for the multi-game cart (post-review). Two fixes:
--  1) Backfill account_verified for LEGACY lines. 0063 added account_verified as NOT NULL DEFAULT false, so
--     Postgres materialised `false` on every pre-existing row at ADD COLUMN time — the 0063 coalesce backfill
--     therefore never carried down the order's verified flag. Without this, a legacy paid-but-open order can
--     never auto-fulfil (the matcher requires account_verified=true). Idempotent, scoped to stranded rows.
update public.game_topup_order_lines l
set account_verified = o.verified
from public.game_topup_orders o
where l.order_id = o.id
  and l.account_verified = false
  and o.verified = true;

--  2) ATOMIC per-identity OCR try-ladder. The app's read-modify-write upsert lost updates under parallel OCR
--     POSTs (N requests all read tries=0 → all write tries=1 → lockout never trips). This RPC does the
--     increment in-DB under the row lock (mirrors game_topup_try_vision). Returns tries_left + blocked_until.
create or replace function public.game_topup_verify_bump(
  p_game text,
  p_account_norm text,
  p_tag text,
  p_screenshot_path text,
  p_ocr_text text,
  p_lock_min1 integer,
  p_lock_min2 integer
) returns table(tries_left integer, blocked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tries integer;
  v_block_level integer;
  v_blocked timestamptz;
begin
  -- Atomic increment: the on-conflict update runs under the unique row lock, so concurrent bumps serialize
  -- and each sees the committed tries.
  insert into game_topup_verify_attempts (game, account_norm, tag, tries, block_level, last_screenshot_path, last_ocr_text, verified_at, updated_at)
    values (p_game, p_account_norm, p_tag, 1, 0, p_screenshot_path, p_ocr_text, null, now())
  on conflict (game, account_norm, tag) do update
    set tries = game_topup_verify_attempts.tries + 1,
        last_screenshot_path = excluded.last_screenshot_path,
        last_ocr_text = excluded.last_ocr_text,
        verified_at = null,                 -- a mismatch invalidates any prior verification
        updated_at = now()
  returning tries, block_level into v_tries, v_block_level;

  if v_tries >= 3 then
    v_blocked := now() + ((case when v_block_level = 0 then p_lock_min1 else p_lock_min2 end) || ' minutes')::interval;
    update game_topup_verify_attempts
      set tries = 0, block_level = v_block_level + 1, blocked_until = v_blocked, updated_at = now()
      where game = p_game and account_norm = p_account_norm and tag = p_tag;
    return query select 0, v_blocked;
  else
    return query select (3 - v_tries), null::timestamptz;
  end if;
end;
$$;
