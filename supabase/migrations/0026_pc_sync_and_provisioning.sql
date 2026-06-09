-- 0026_pc_sync_and_provisioning.sql
-- Live-seating feed from Comffee Clockwork's control-server (replaces the old
-- PanCafe sync script) + auto-provisioning metadata for partner onboarding.

-- Clockwork OWNS the PC timer, so it knows each session's exact END time. Store
-- it directly instead of guessing from start time the way the PanCafe sync did;
-- the public live board's countdown reads this.
alter table public.pc_stations
  add column if not exists current_session_ends_at timestamptz;

-- Per-branch ingest token. A Comffee Clockwork counter's control-server presents
-- this in the `x-sync-token` header when pushing station snapshots to /api/pc-sync.
-- LOW-PRIVILEGE: it only lets the holder write THIS branch's public seating
-- status (no service-role key ever lives on a counter). Generated at provision
-- time; rotate by updating this column.
alter table public.branches
  add column if not exists pc_sync_token text;

-- Audit which Comffee package provisioned this branch: 'clockwork' | 'pos'.
alter table public.branches
  add column if not exists provisioned_package text;

create index if not exists branches_pc_sync_token_idx
  on public.branches (pc_sync_token) where pc_sync_token is not null;
