-- Add a third value to branch_type: 'partner_cafe'.
--
-- WHY: Comffee franchises (Lagro, SJDM) stay as 'cafe' and live at /branches/<slug>. Independent
-- internet cafe owners who bought the Comffee POS as SaaS are a DIFFERENT public category — they
-- live at /partners/<slug> (a separate topbar section: "Partner Cafes"). Playcation stays as
-- 'playcation' and is unaffected.
--
-- WHY ENUM (not a separate boolean column): cleanest expression of "this is a distinct category"
-- and the existing site-wide filters already key off branch_type === 'cafe' vs 'playcation'; one
-- more value slots in with one-line additions per consumer ([[comffee-saas-vision]]).
--
-- WHY 'IF NOT EXISTS': makes the migration idempotent if it's already been run somewhere.
-- ALTER TYPE ... ADD VALUE must NOT be wrapped in a transaction with other statements that USE the
-- new value (PostgreSQL constraint). Keeping this migration as a single ADD VALUE statement keeps
-- it safe regardless of how it's applied.

alter type public.branch_type add value if not exists 'partner_cafe';
