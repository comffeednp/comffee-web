-- 0058_floorplan_controllers.sql   (WEB project uioeefxnugnqhvthaxjf)
-- Console controllers (2026-06-15). The PS5 base price covers `included_controllers`; each controller
-- beyond that adds `extra_controller_price` (flat, once per session). `max_controllers` caps the picker
-- (POS + website). These mirror the POS floorplan_elements columns and are synced one-way POS→cloud by
-- the POS floorplan:save push. The controller count chosen for a booking is stored on
-- floorplan_reservations.controllers, which the POS pulls into its live board.
-- Additive + idempotent; safe to re-run. Reversible via DROP COLUMN.
alter table public.branch_floorplan_elements add column if not exists included_controllers   integer not null default 0;
alter table public.branch_floorplan_elements add column if not exists extra_controller_price numeric not null default 0;
alter table public.branch_floorplan_elements add column if not exists max_controllers        integer not null default 0;
alter table public.floorplan_reservations    add column if not exists controllers            integer not null default 1;
