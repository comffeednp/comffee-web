-- Comffee Playcation Imus Resthouse — full branch seed (safe to re-run)
-- Run in Supabase SQL editor. Will upsert branch and wipe+reinsert amenities/rates/photos.

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
    max_guests, is_published, sort_order
  ) VALUES (
    'playcation-imus',
    'Comffee Playcation · Imus',
    'playcation',
    '120 sqm private resthouse with 6 gaming PCs, PS5, pool table, and room for 12.',
    'Imus, Cavite',
    'Imus, Cavite',
    14.3570, 120.9370,
    $desc$## The Space

A fully private 120 sqm two-floor resthouse built for gaming marathons, esports bootcamps, and premium group stays. Two floors, three bedrooms, four beds — comfortably sleeps 12 with two guest mattresses available for the extras.

## Gaming Setup

Six high-end PCs (Ryzen 7 5700X3D · RTX 4060 8GB · 32GB RAM · 1TB NVMe) on Acer AOPEN 24.5" 390Hz IPS monitors. Install any game you want — the PCs are yours for the duration of your stay.

The console area runs a PlayStation 5 with three DualSense controllers and a loaded game library: NBA 2K26, Tekken 8, Overcooked 2, and Gran Turismo 7.

## Beyond the Screens

Step outside to a covered patio with a pool table and darts board. A full kitchen, dining area, and two living room TVs make the downtime just as good. There's also a piano, guitar, basketball, chess, scrabble, jenga, and cards for when you need a break from the monitor.

The balcony and garden with an outdoor bar table are perfect for evening wind-downs. An electric scooter is available for short rides around the neighborhood.

## Connectivity

One Converge fiber line managed through a dedicated MikroTik router — QoS-configured so six gaming PCs run lag-free simultaneously.

## Pool Access

Pool use is subject to availability. Not available on Sundays. Saturdays are subject to availability — confirm at booking.

## Parking

Free street parking in front. Overnight paid parking available at ₱300.

## House Rules & Violations

**Strictly prohibited — immediate eviction without refund:**
- Bringing in unregistered additional guests beyond the declared count
- Subletting or sharing access with non-booked parties
- Any form of illegal activity on the premises
- Tampering with CCTV cameras or security equipment
- Damaging or removing any property (gaming peripherals, furniture, appliances, fixtures)
- Smoking inside the resthouse (outdoor areas only)
- Bringing pets of any kind inside the unit

**Additional rules:**
- Karaoke is strictly not allowed
- Alcoholic beverages are allowed — drink moderately
- The security camera at the entrance must not be turned off
- Guests are responsible for any loss or damage during the stay
- Inventory is checked before and after each stay
- Comffee reserves the right to share Guest information with other operators to prevent repeat violations

Comffee maintains a full inventory record of unit contents before and after every stay.$desc$,
    v_pub_base || '/imus/patio-wide.png',
    'Check-in 2:00 PM · Check-out 11:00 AM · Early in / Late out ₱500/hr',
    20,
    true,
    5
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
    max_guests     = EXCLUDED.max_guests,
    is_published   = EXCLUDED.is_published,
    sort_order     = EXCLUDED.sort_order;

  SELECT id INTO v_branch_id FROM public.branches WHERE slug = 'playcation-imus';

  -- ── AMENITIES ─────────────────────────────────────────────────────────────
  DELETE FROM public.branch_amenities WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_amenities (branch_id, icon, label, description, sort_order) VALUES
    (v_branch_id, 'monitor',    '6 Gaming PCs',           'Ryzen 7 5700X3D · RTX 4060 8GB · 32GB RAM · 390Hz IPS',         0),
    (v_branch_id, 'keyboard',   'Full Peripherals',        'RAKK Talan mouse · InPlay HT220 headset · 3 mechanical keyboards', 1),
    (v_branch_id, 'gamepad',    'PlayStation 5',           'PS5 · 3 controllers · NBA 2K26, Tekken 8, Overcooked 2, GT7',    2),
    (v_branch_id, 'home',       '120 sqm 2-Floor House',  'Fully private resthouse · exclusive use only',                    3),
    (v_branch_id, 'bed',        '3 Bedrooms · 4 Beds',    '+ 2 guest mattresses · sleeps up to 12',                         4),
    (v_branch_id, 'bath',       '2 Bathrooms',            'Bidets · shower heater in upper room',                           5),
    (v_branch_id, 'aircon',     'Fully Air-Conditioned',  'All rooms air-conditioned',                                       6),
    (v_branch_id, 'utensils',   'Full Kitchen',           'Living room · dining area · kitchen',                            7),
    (v_branch_id, 'billiard',   'Pool Table & Darts',     'Covered outdoor patio area',                                     8),
    (v_branch_id, 'tv',         '2 TVs',                  NULL,                                                              9),
    (v_branch_id, 'scooter',    'Electric Scooter',       'Available for use during stay',                                  10),
    (v_branch_id, 'music',      'Piano & Guitar',         NULL,                                                             11),
    (v_branch_id, 'gamepad2',   'Board Games',            'Basketball · chess · scrabble · jenga · cards',                  12),
    (v_branch_id, 'balcony',    'Balcony & Garden',       'Outdoor bar table',                                              13),
    (v_branch_id, 'pool',       'Pool Access',            'Subject to availability · not available Sundays',                14),
    (v_branch_id, 'mikrotik',   'Converge Fiber',         'MikroTik-managed · QoS for 6 simultaneous gaming PCs',          15),
    (v_branch_id, 'selfie',     'Selfie Mirror',          NULL,                                                             16),
    (v_branch_id, 'parking',    'Parking',                'Free street parking · ₱300 overnight paid parking',             17);

  -- ── RATES ─────────────────────────────────────────────────────────────────
  DELETE FROM public.branch_rates WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_rates (
    branch_id, category, label, description,
    price_php, unit, sort_order,
    check_in_time, check_out_time,
    max_guests, max_pax, extra_pax_fee_php
  ) VALUES
    (v_branch_id, 'playcation', 'Overnight',
     'Full resthouse · up to 8 guests · ₱500/head for additional guests (max 20 total) · Free street parking',
     8000, 'night', 1,
     '14:00', '11:00',
     20, 8, 500),

    (v_branch_id, 'playcation', 'Tournament Week',
     '7-night pack · cleaning every 3 days · up to 12 pax · for esports bootcamps & online tournaments',
     50000, 'pack', 2,
     '14:00', '11:00',
     12, 12, NULL),

    (v_branch_id, 'playcation', 'Monthly Bootcamp',
     '30-night pack · weekly cleaning · up to 12 pax · for professional teams & extended prep',
     200000, 'pack', 3,
     '14:00', '11:00',
     12, 12, NULL);

  -- ── PHOTOS ────────────────────────────────────────────────────────────────
  DELETE FROM public.branch_photos WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_photos (branch_id, storage_path, public_url, caption, sort_order) VALUES
    (v_branch_id, 'imus/patio-wide.png',
     v_pub_base || '/imus/patio-wide.png',
     'Covered patio with pool table and electric scooter', 1),

    (v_branch_id, 'imus/dining-piano.png',
     v_pub_base || '/imus/dining-piano.png',
     'Dining area, living room, and piano', 2),

    (v_branch_id, 'imus/living-room-tv.png',
     v_pub_base || '/imus/living-room-tv.png',
     'Living room with TV and sofa', 3),

    (v_branch_id, 'imus/patio-pooltable.png',
     v_pub_base || '/imus/patio-pooltable.png',
     'Pool table and darts board', 4),

    (v_branch_id, 'imus/exterior-gate.png',
     v_pub_base || '/imus/exterior-gate.png',
     'Exterior — gate and patio entrance', 5);

  RAISE NOTICE 'Done — Imus branch ID: %', v_branch_id;
END $$;
