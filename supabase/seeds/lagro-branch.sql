-- Comffee Internet Cafe Lagro — full branch seed (safe to re-run)
-- Run in Supabase SQL editor. Upserts branch, wipes+reinserts amenities and photos.
-- Update address, city, lat/lng, and hours_text via admin panel after running.

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
    is_published, sort_order
  ) VALUES (
    'lagro',
    'Comffee Internet Cafe Lagro',
    'cafe',
    'Lagro''s main gaming hub — Regular and VIP rigs, full esports setup, open all day.',
    'Lagro, Quezon City',
    'Quezon City',
    14.7100, 121.0340,
    $desc$## The Setup

Comffee Internet Cafe Lagro is our flagship Quezon City branch — a full-spec gaming cafe built for serious players and casual sessions alike. Regular and VIP stations are available, both running high-end hardware and peripherals.

## Regular Stations

Built for competitive play and smooth everyday sessions.

- **Monitor:** 180Hz 27" display
- **GPU:** RTX 3050
- **Processor:** Ryzen 5 5600
- **RAM:** 16GB
- **Desk:** 100cm per player
- **Mouse:** Logitech G203

## VIP Stations

Upgraded hardware, premium peripherals, and a monitor arm for better ergonomics.

- **Monitor:** 24" 240Hz 1ms
- **GPU:** RTX 3050 8GB (≈20% faster than Regular)
- **Processor:** Ryzen 5 5600
- **RAM:** 16GB
- **Mouse:** Attack Shark X3 wireless
- **Headset:** Razer BlackShark V2 X
- **Keyboard:** Royal Kludge RK R98 Pro mechanical (with knob)
- **Chair:** Musso Retro Series 249B
$desc$,
    v_pub_base || '/lagro/img_2886.jpg',
    'Open daily — check branch for hours',
    true,
    1
  )
  ON CONFLICT (slug) DO UPDATE SET
    name           = EXCLUDED.name,
    tagline        = EXCLUDED.tagline,
    description_md = EXCLUDED.description_md,
    hero_image_url = EXCLUDED.hero_image_url,
    hours_text     = EXCLUDED.hours_text,
    is_published   = EXCLUDED.is_published,
    sort_order     = EXCLUDED.sort_order;

  SELECT id INTO v_branch_id FROM public.branches WHERE slug = 'lagro';

  -- ── AMENITIES ─────────────────────────────────────────────────────────────
  DELETE FROM public.branch_amenities WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_amenities (branch_id, icon, label, description, sort_order) VALUES
    -- Regular tier
    (v_branch_id, 'monitor',    'Regular · 180Hz 27" Monitor',     'Smooth 180Hz refresh for competitive gaming',                       0),
    (v_branch_id, 'gpu',        'Regular · RTX 3050',              'Ryzen 5 5600 · 16GB RAM · solid 1080p performance',                 1),
    (v_branch_id, 'mouse',      'Regular · Logitech G203',         '100cm dedicated desk per player',                                   2),
    -- VIP tier
    (v_branch_id, 'monitor',    'VIP · 240Hz 1ms 24" Monitor',     'Ultra-fast response with monitor arm ergonomic setup',              3),
    (v_branch_id, 'gpu',        'VIP · RTX 3050 8GB',              'Ryzen 5 5600 · 16GB RAM · ≈20% faster than Regular',              4),
    (v_branch_id, 'mouse',      'VIP · Attack Shark X3',           'Wireless gaming mouse',                                             5),
    (v_branch_id, 'headset',    'VIP · Razer BlackShark V2 X',     'Premium gaming headset',                                            6),
    (v_branch_id, 'keyboard',   'VIP · Royal Kludge RK R98 Pro',   'Mechanical keyboard with volume knob',                              7),
    (v_branch_id, 'chair',      'VIP · Musso Retro 249B',          'Full ergonomic gaming chair',                                       8);

  -- ── PHOTOS ────────────────────────────────────────────────────────────────
  DELETE FROM public.branch_photos WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_photos (branch_id, storage_path, public_url, caption, sort_order) VALUES
    (v_branch_id, 'lagro/img_2886.jpg',
     v_pub_base || '/lagro/img_2886.jpg', NULL, 1),
    (v_branch_id, 'lagro/img_2888.jpg',
     v_pub_base || '/lagro/img_2888.jpg', NULL, 2),
    (v_branch_id, 'lagro/img_2132.jpg',
     v_pub_base || '/lagro/img_2132.jpg', NULL, 3),
    (v_branch_id, 'lagro/img_2313.jpg',
     v_pub_base || '/lagro/img_2313.jpg', NULL, 4),
    (v_branch_id, 'lagro/img_6188.jpg',
     v_pub_base || '/lagro/img_6188.jpg', NULL, 5),
    (v_branch_id, 'lagro/76ca5ec9-91d4-4f44-be33-87c051b742e8.jpg',
     v_pub_base || '/lagro/76ca5ec9-91d4-4f44-be33-87c051b742e8.jpg', NULL, 6),
    (v_branch_id, 'lagro/8603290e-5996-4724-be95-2c2b35749ed0.jpg',
     v_pub_base || '/lagro/8603290e-5996-4724-be95-2c2b35749ed0.jpg', NULL, 7),
    (v_branch_id, 'lagro/4e063a7b-7142-445a-b870-d90bb4edff48_l0_001-4_11_2025--9_10_10-am.jpg',
     v_pub_base || '/lagro/4e063a7b-7142-445a-b870-d90bb4edff48_l0_001-4_11_2025--9_10_10-am.jpg', NULL, 8),
    (v_branch_id, 'lagro/9ae41509-b639-4a92-95fc-a903a1ffcc3e_l0_001-4_11_2025--9_24_49-am.jpg',
     v_pub_base || '/lagro/9ae41509-b639-4a92-95fc-a903a1ffcc3e_l0_001-4_11_2025--9_24_49-am.jpg', NULL, 9),
    (v_branch_id, 'lagro/ae99b7fa-5cb4-4bfb-b43f-1f95335b237e_l0_001-4_11_2025--9_33_26-am.jpg',
     v_pub_base || '/lagro/ae99b7fa-5cb4-4bfb-b43f-1f95335b237e_l0_001-4_11_2025--9_33_26-am.jpg', NULL, 10);

  RAISE NOTICE 'Done — Lagro branch ID: %', v_branch_id;
END $$;
