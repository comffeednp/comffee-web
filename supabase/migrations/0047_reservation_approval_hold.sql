-- Request-to-book (part 2 of 2). Run AFTER 0046.
--
-- A waiting (paid) request must HOLD its dates so no one else can book them
-- while the owner decides — so 'pending_approval' joins the no-double-booking
-- rule alongside pending_hold + confirmed.
--
-- approval_requested_at stamps when payment landed and the request started
-- waiting — the 24h auto-reject timer measures from here.
alter table public.reservations
  add column if not exists approval_requested_at timestamptz;

alter table public.reservations drop constraint if exists reservations_no_overlap;
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    branch_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (status in ('pending_hold', 'confirmed', 'pending_approval'));
