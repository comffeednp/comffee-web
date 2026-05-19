-- Comffee Playcation Vine — full amenity seed (safe to re-run)
-- Clears existing amenities for this branch and re-inserts the full list.

DO $$
DECLARE
  v_branch_id uuid := '932f27ba-f14b-45df-9200-05a6ee2255b7';
BEGIN
  -- Wipe existing so we always get clean, correct data
  DELETE FROM public.branch_amenities WHERE branch_id = v_branch_id;

  INSERT INTO public.branch_amenities (branch_id, icon, label, description, sort_order)
  VALUES
    (v_branch_id, 'monitor',    '3 Gaming PCs',            'RTX 3050 · Ryzen 5 5600 · 16GB DDR4 · 240Hz monitor',  0),
    (v_branch_id, 'ps',         'PlayStation 5',           'PS5 + 32" TV · Netflix, YouTube, Disney+',             1),
    (v_branch_id, 'gamepad',    'Games Library',           'Install any games you like',                           2),
    (v_branch_id, 'mouse',      'Attack Shark X3 Mouse',   NULL,                                                   3),
    (v_branch_id, 'keyboard',   'Royal Kludge R98',        'Mechanical keyboard',                                  4),
    (v_branch_id, 'headphones', 'Razer BlackShark V2 X',   'Gaming headset',                                       5),
    (v_branch_id, 'sofa',       'Musso Gaming Chairs',     'Musso Retro Series · 3 units',                        6),
    (v_branch_id, 'mikrotik',   'MikroTik Network',        'Globe Fiber 300Mbps',                                  7),
    (v_branch_id, 'bed',        '1 Bedroom · 2 Beds',      'Sleeps up to 4 guests',                               8),
    (v_branch_id, 'city',       'Private Balcony',         '12th floor · city view',                              9),
    (v_branch_id, 'aircon',     '2 Air Conditioners',      NULL,                                                   10),
    (v_branch_id, 'shower',     'Hot Shower + Bidet',      NULL,                                                   11),
    (v_branch_id, 'utensils',   'Kitchen',                 'Microwave, kettle, rice cooker, refrigerator',        12),
    (v_branch_id, 'sparkles',   'Essentials',              'Towels & toiletries included',                        13),
    (v_branch_id, 'pool',       'Pool Access',             'Ground floor swimming pool',                          14),
    (v_branch_id, 'parking',    'Parking',                 'Paid parking available',                              15);

  RAISE NOTICE 'Done — % amenities inserted', (SELECT count(*) FROM public.branch_amenities WHERE branch_id = v_branch_id);
END $$;
