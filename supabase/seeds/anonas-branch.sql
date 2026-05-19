-- Comffee Playcation Anonas — full branch seed (safe to re-run)
-- Run in Supabase SQL editor.

DO $$
DECLARE
  v_branch_id uuid;
  v_pub_base  text := 'https://uioeefxnugnqhvthaxjf.supabase.co/storage/v1/object/public/branch-photos';
BEGIN

  -- ── BRANCH ────────────────────────────────────────────────────────────────
  INSERT INTO public.branches (
    slug, name, type, tagline, address, city,
    lat, lng,
    description_md, hero_image_url, hours_text,
    phone, email,
    max_guests, is_published, sort_order
  ) VALUES (
    'playcation-anonas',
    'Comffee Playcation · Anonas',
    'playcation',
    'High-rise bootcamp setup on the 21st floor — gaming rigs, PS5, and room for 6, near MRT Anonas.',
    '21F North Tower, City of Ortigas Skyline, Aurora Blvd',
    'Quezon City',
    14.6272, 121.0567,
    $desc$## The Space

A private playcation unit on the 21st floor of the North Tower, City of Ortigas Skyline — with a skyline view and direct access to MRT Anonas. Built as a bootcamp-ready overnight setup for squads of up to 6. Overnight bookings only; no daycation rates.

## Sleeping Arrangements

- 1 sofa bed
- 1 single bed
- 1 single floor mattress
- 1 full double floor mattress

Comfortable for up to 6 guests. Clean beds, linens, and towels provided (base set for 3 pax).

## Gaming Setup

- Ryzen 5 5600 · RX 580 8GB · 27" 180Hz monitors
- Premium peripherals at every station
- PlayStation 5 with TV — Netflix, YouTube, and streaming apps available

## Staycation Inclusions

- Private unit, exclusive use for your group
- Towels and linens provided
- Fully air-conditioned
- High-speed Wi-Fi
- Shower with water heater
- Filtered drinking water
- Microwave, electric kettle, and rice cooker
- Refrigerator

## Building Facilities

- Convenience store at Basement 1 (open until 10:00 PM)
- Basement parking available at ₱300/night
$desc$,
    v_pub_base || '/anonas/402b7ce3-eefb-451a-a463-db709c5493eb.jpg',
    'Check-in 2:00 PM · Check-out 11:00 AM · Early in / Late out ₱300/hr',
    '09812214592',
    'comffeeinternetcafe@gmail.com',
    6,
    true,
    6
  )
  ON CONFLICT (slug) DO UPDATE SET
    name           = EXCLUDED.name,
    tagline        = EXCLUDED.tagline,
    address        = EXCLUDED.address,
    city           = EXCLUDED.city,
    lat            = EXCLUDED.lat,
    lng            = EXCLUDED.lng,
    description_md = EXCLUDED.description_md,
    hero_image_url = EXCLUDED.hero_image_url,
    hours_text     = EXCLUDED.hours_text,
    phone          = EXCLUDED.phone,
    email          = EXCLUDED.email,
    max_guests     = EXCLUDED.max_guests,
    is_published   = EXCLUDED.is_published,
    sort_order     = EXCLUDED.sort_order;

  SELECT id INTO v_branch_id FROM public.branches WHERE slug = 'playcation-anonas';

  -- ── RATES ─────────────────────────────────────────────────────────────────
  DELETE FROM public.branch_rates WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_rates (
    branch_id, category, label, description,
    price_php, unit, sort_order,
    check_in_time, check_out_time,
    max_guests, max_pax, extra_pax_fee_php
  ) VALUES (
    v_branch_id, 'playcation', 'Overnight',
    'Private unit · up to 3 guests · ₱600/head for guests 4–6 · Basement parking ₱300/night',
    3990, 'night', 1,
    '14:00', '11:00',
    6, 3, 600
  );

  -- ── AMENITIES ─────────────────────────────────────────────────────────────
  DELETE FROM public.branch_amenities WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_amenities (branch_id, icon, label, description, sort_order) VALUES
    (v_branch_id, 'monitor',  'Gaming PCs',            'Ryzen 5 5600 · RX 580 8GB · 27" 180Hz monitors',            0),
    (v_branch_id, 'keyboard', 'Premium Peripherals',   'Full gaming peripheral setup at every station',               1),
    (v_branch_id, 'gamepad',  'PlayStation 5',         'PS5 with TV · Netflix, YouTube, streaming apps',              2),
    (v_branch_id, 'bed',      'Sleeping for 6',        '1 sofa bed · 1 single bed · 2 floor mattresses',             3),
    (v_branch_id, 'bath',     'Towels & Linens',       'Provided · shower with water heater',                         4),
    (v_branch_id, 'aircon',   'Air-Conditioned',       'Fully air-conditioned unit',                                  5),
    (v_branch_id, 'wifi',     'High-Speed Wi-Fi',      NULL,                                                          6),
    (v_branch_id, 'utensils', 'Kitchen Area',          'Microwave · electric kettle · rice cooker · refrigerator',    7),
    (v_branch_id, 'droplets', 'Filtered Water',        'Filtered drinking water available',                           8),
    (v_branch_id, 'store',    'Convenience Store',     'Basement 1 · open until 10:00 PM',                           9),
    (v_branch_id, 'parking',  'Basement Parking',      '₱300/night · subject to availability',                       10),
    (v_branch_id, 'building', '21F Skyline View',      'North Tower · City of Ortigas Skyline · near MRT Anonas',    11),
    (v_branch_id, 'home',     'Private Unit',          'Exclusive use · overnight only · no daycation',              12);

  -- ── PHOTOS ────────────────────────────────────────────────────────────────
  DELETE FROM public.branch_photos WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_photos (branch_id, storage_path, public_url, caption, sort_order) VALUES
    (v_branch_id, 'anonas/402b7ce3-eefb-451a-a463-db709c5493eb.jpg', v_pub_base || '/anonas/402b7ce3-eefb-451a-a463-db709c5493eb.jpg', 'Gaming setup', 1),
    (v_branch_id, 'anonas/0962770b-7929-4ec8-a965-dcb95d1d7f5a.jpg', v_pub_base || '/anonas/0962770b-7929-4ec8-a965-dcb95d1d7f5a.jpg', NULL, 2),
    (v_branch_id, 'anonas/1e20fb14-3efb-4d25-8fab-a43816de4e3f.jpg', v_pub_base || '/anonas/1e20fb14-3efb-4d25-8fab-a43816de4e3f.jpg', NULL, 3),
    (v_branch_id, 'anonas/31afd388-5db4-4b63-bd98-53f98b028cde.jpg', v_pub_base || '/anonas/31afd388-5db4-4b63-bd98-53f98b028cde.jpg', NULL, 4),
    (v_branch_id, 'anonas/58fe2075-efd4-456b-82be-6e73388add4f.jpg', v_pub_base || '/anonas/58fe2075-efd4-456b-82be-6e73388add4f.jpg', NULL, 5),
    (v_branch_id, 'anonas/5eaef590-0000-45b1-b553-cffa217d79d2.jpg', v_pub_base || '/anonas/5eaef590-0000-45b1-b553-cffa217d79d2.jpg', NULL, 6),
    (v_branch_id, 'anonas/8aa483d1-2dd0-4747-a0be-d2069e22ba87.jpg', v_pub_base || '/anonas/8aa483d1-2dd0-4747-a0be-d2069e22ba87.jpg', NULL, 7),
    (v_branch_id, 'anonas/a1a1dd6d-e111-49c5-a9d0-8c7f770fa3b4.jpg', v_pub_base || '/anonas/a1a1dd6d-e111-49c5-a9d0-8c7f770fa3b4.jpg', NULL, 8),
    (v_branch_id, 'anonas/a943d603-b187-484a-9acc-2594deace902.jpg', v_pub_base || '/anonas/a943d603-b187-484a-9acc-2594deace902.jpg', NULL, 9),
    (v_branch_id, 'anonas/b616803c-2e3a-4f36-b366-51ce37f17243.jpg', v_pub_base || '/anonas/b616803c-2e3a-4f36-b366-51ce37f17243.jpg', NULL, 10),
    (v_branch_id, 'anonas/d74e8d6a-5603-4ff2-ba34-bd9aa04f89d0.jpg', v_pub_base || '/anonas/d74e8d6a-5603-4ff2-ba34-bd9aa04f89d0.jpg', NULL, 11);

  RAISE NOTICE 'Done — Anonas branch ID: %', v_branch_id;
END $$;
