-- Request-to-book (part 1 of 2): a paid website booking now WAITS for the owner
-- to accept/reject instead of confirming instantly. This adds the new status.
--
-- It MUST be its own migration: Postgres won't let a brand-new enum value be
-- USED in the same transaction that adds it, and 0047 references it in the
-- no-double-booking constraint. Run this one first, then 0047.
alter type public.reservation_status add value if not exists 'pending_approval';
