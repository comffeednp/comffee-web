-- Test Playcation listing — for live PayMongo testing
-- Run in Supabase SQL editor. Safe to re-run.
-- Delete this branch after live testing is complete.

DO $$
DECLARE
  v_branch_id uuid;
BEGIN

  -- ── BRANCH ────────────────────────────────────────────────────────────────
  INSERT INTO public.branches (
    slug, name, type, tagline, address, city,
    description_md, hero_image_url, hours_text,
    max_guests, is_published, sort_order
  ) VALUES (
    'test-playcation',
    'Comffee Playcation · Test Unit',
    'playcation',
    'Test listing for payment flow verification. Not a real bookable unit.',
    'Quezon City',
    'Quezon City',
    $desc$## Test Listing

This is a test listing used to verify the end-to-end booking and payment flow.

Not a real unit — do not book.$desc$,
    NULL,
    'Check-in 2:00 PM · Check-out 11:00 AM',
    10,
    true,
    99
  )
  ON CONFLICT (slug) DO UPDATE SET
    name           = EXCLUDED.name,
    tagline        = EXCLUDED.tagline,
    description_md = EXCLUDED.description_md,
    hours_text     = EXCLUDED.hours_text,
    max_guests     = EXCLUDED.max_guests,
    is_published   = EXCLUDED.is_published,
    sort_order     = EXCLUDED.sort_order;

  SELECT id INTO v_branch_id FROM public.branches WHERE slug = 'test-playcation';

  -- ── AMENITIES ─────────────────────────────────────────────────────────────
  DELETE FROM public.branch_amenities WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_amenities (branch_id, icon, label, description, sort_order) VALUES
    (v_branch_id, 'monitor', 'Test Setup', 'Placeholder for live payment testing', 0);

  -- ── RATES ─────────────────────────────────────────────────────────────────
  DELETE FROM public.branch_rates WHERE branch_id = v_branch_id;

  -- ₱500/night so live test charge is real but small
  INSERT INTO public.branch_rates (
    branch_id, category, label, description,
    price_php, unit, sort_order,
    check_in_time, check_out_time,
    max_guests, max_pax, extra_pax_fee_php
  ) VALUES (
    v_branch_id, 'playcation', 'Overnight',
    'Test rate — ₱500/night · up to 2 guests',
    500, 'night', 1,
    '14:00', '11:00',
    2, 2, NULL
  );

  RAISE NOTICE 'Done — test-playcation branch ID: %', v_branch_id;
END $$;
