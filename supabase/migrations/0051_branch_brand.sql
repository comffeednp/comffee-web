-- Add an optional "brand" grouping to branches (used only by partner cafes).
--
-- WHY: The public /partners page now lets visitors search partner cafes and, when one partner
-- operates MULTIPLE locations, shows the brand name first and reveals a per-brand branch picker on
-- hover. Until now a branch row had no way to say "these rows belong to the same owner's chain" —
-- every row is a standalone location. `brand` is that grouping key.
--
-- SEMANTICS: among rows with type='partner_cafe', equal (case-insensitive) non-null `brand` = the
-- same chain; they collapse into one brand card on /partners. NULL brand (the default, and the only
-- state for Comffee 'cafe'/'playcation' rows) = a standalone single-location partner rendered as its
-- own card.
--
-- Nullable + no backfill: existing rows stay NULL, so behavior is unchanged. The website degrades
-- gracefully whether or not this column exists yet — the partner finder treats missing/NULL as solo
-- — so applying this is safe and fully reversible (drop the column to undo).
alter table public.branches
  add column if not exists brand text;

comment on column public.branches.brand is
  'Optional chain/brand grouping for partner_cafe branches. Equal non-null values group together on /partners; NULL = standalone.';
