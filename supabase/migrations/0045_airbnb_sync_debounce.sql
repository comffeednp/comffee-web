-- Airbnb sync hardening: give each Airbnb feed a short memory so a flaky /
-- truncated Airbnb export can't wrongly free real bookings.
--
-- WHY: Airbnb's iCal export intermittently returns an incomplete (or empty)
-- list. The old sync freed any night missing from a single fetch and then
-- refused to bring it back — this stranded 7 Imus nights as "available" while
-- Airbnb still had them booked (found + repaired by hand 2026-06-02).
--
-- These two columns are read/written ONLY by the Airbnb sync. They do not
-- touch website bookings or any booking-page behavior.
--   last_event_count — number of events seen on the last CLEAN (non-glitch)
--                      run; the glitch guard compares the new feed against it.
--   missing_uids     — UIDs that were missing on the PREVIOUS run only. A night
--                      must be missing on two runs in a row before we free it.
alter table public.airbnb_calendars
  add column if not exists last_event_count integer,
  add column if not exists missing_uids jsonb not null default '[]'::jsonb;
