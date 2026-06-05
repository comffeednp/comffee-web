-- Track WHEN each PC went vacant, so the website can require a PC to have been vacant for N minutes
-- before it's offered for online reservation (a just-freed seat may be a PanCafe flicker, the previous
-- walk-in may sit back down, or the cashier needs a beat). Strengthens the "no false-vacant / no
-- double-booking" rule — it can only DELAY availability, never widen it.
--
-- WHY a DB trigger (not POS code): the POS UPSERTs pc_stations every ~10-30s but is STATELESS — it
-- never reads the prior row, so it can't compute "when did this go vacant". A BEFORE trigger sees OLD
-- vs NEW and stamps the moment is_occupied flips true→false, clears it on false→true, and PRESERVES it
-- across repeated vacant writes (the clock never resets). So: zero POS change, no cashier redeploy.
--
-- The clock starts when the POS marks the seat free — which is ~75s after the player actually leaves
-- (the POS's existing FREE_CONFIRM debounce), so real-world the buffer is a bit longer than N. Good:
-- conservative is correct here.

alter table public.pc_stations add column if not exists vacant_since timestamptz;

-- Backfill currently-vacant rows BEFORE the trigger exists (so the trigger can't reset the value).
-- We don't know their true vacancy moment, so start the clock now (conservative: they become
-- reservable one buffer-length after this migration, never sooner).
update public.pc_stations set vacant_since = now() where is_occupied = false and vacant_since is null;

create or replace function public.pc_stations_set_vacant_since()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    -- New row: a vacant one starts its clock now; an occupied one has no clock.
    new.vacant_since := case when new.is_occupied then null else now() end;
    return new;
  end if;

  -- UPDATE: move the clock ONLY on the occupancy edge. Otherwise leave vacant_since exactly as the
  -- write left it — the POS never sends this column, so a non-edge upsert preserves it automatically;
  -- a deliberate backfill that sets it is honored. (An `else` that copied old.vacant_since would also
  -- clobber such an explicit backfill — that was the bug.)
  if (new.is_occupied is distinct from old.is_occupied) then
    new.vacant_since := case when new.is_occupied then null else now() end;
  elsif (new.is_occupied = false and new.vacant_since is null) then
    -- Defensive: a future POS build that "mirrors all columns" could send a null vacant_since on a
    -- non-edge vacant write; recover the clock from OLD so it never resets. coalesce(old, now()) is
    -- never an OLDER timestamp, so this can only DELAY availability — never widen it.
    new.vacant_since := coalesce(old.vacant_since, now());
  end if;
  return new;
exception
  when others then
    -- A bug here must NEVER block the POS seating UPSERT (a broken sync = false-vacant = double-book
    -- risk). On any error, let the write through unchanged.
    return new;
end;
$$;

drop trigger if exists trg_pc_stations_vacant_since on public.pc_stations;
create trigger trg_pc_stations_vacant_since
  before insert or update on public.pc_stations
  for each row execute function public.pc_stations_set_vacant_since();
