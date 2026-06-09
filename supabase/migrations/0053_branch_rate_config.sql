-- 0053: branch rate_config (display-only rich rate editor)
--
-- WHY: cafe owners set up their rates/specs in the POS "Cafe page" editor. The old flat
-- branch_rates list is hard to use for new clients. This adds ONE additive JSONB column that
-- holds the richer, owner-friendly structure shown on the public cafe page:
--
--   rate_config = {
--     total_pcs:   number | null,           -- "how many PCs" (display)
--     categories: [{
--       name:        text,                  -- e.g. "Regular PC", "VIP PC", "PS5 Lounge"
--       color:       text,                  -- hex for the colored dot
--       pc_count:    number,                -- how many stations in this category
--       member_rate: number,               -- member ₱ per hour (display)
--       tiers: [{ label: text, minutes: number, price: number }]
--     }],
--     membership: {
--       fee:                  number,        -- one-time membership fee
--       topup_bonus_pct:      number,        -- top-up bonus %
--       members_avail_promos: boolean,
--       drink_free_hour:      boolean
--     }
--   }
--
-- DISPLAY-ONLY: this does NOT drive billing (PanCafe still owns tariffs). It is shaped so it
-- can later feed a POS billing engine. The public page renders rate_config when present and
-- falls back to the flat branch_rates list otherwise (so existing branches are unaffected).
--
-- Round-trips POS -> branch_edit_submissions.payload.rate_config -> approve -> branches.rate_config.
-- Additive + idempotent; nothing is dropped or rewritten. [[comffee-saas-vision]]

alter table public.branches
  add column if not exists rate_config jsonb;

comment on column public.branches.rate_config is
  'Display-only rich rate config (categories/tiers/member rate/membership/top-up/total PCs). Renders on the public cafe page; falls back to branch_rates when null. Not a billing source.';
