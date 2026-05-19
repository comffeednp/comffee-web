-- =============================================================
-- Seed data — sample branches, amenities, rates, menu so the
-- public site has something to render before real data is added.
-- =============================================================

-- Site settings ---------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('company_name',  to_jsonb('Comffee Drink & Play'::text)),
  ('tagline',       to_jsonb('Coffee. Computers. Console. The internet cafe & Playcation network built for gamers, students, and night owls.'::text)),
  ('contact_phone', to_jsonb('+63 917 000 0000'::text)),
  ('contact_email', to_jsonb('hello@comffe.ph'::text)),
  ('address',       to_jsonb('Quezon City, Metro Manila, Philippines'::text)),
  ('hero_copy',     to_jsonb('Fast PCs. Hotter coffee. Console nights you''ll actually remember.'::text)),
  ('footer_blurb',  to_jsonb('Comffee runs internet cafes, gaming dens, and Playcation stays across the Philippines. Power on with us.'::text)),
  ('social_facebook',  to_jsonb('https://facebook.com/comffe'::text)),
  ('social_instagram', to_jsonb('https://instagram.com/comffe'::text)),
  ('social_tiktok',    to_jsonb('https://tiktok.com/@comffe'::text))
on conflict (key) do nothing;

-- Branches --------------------------------------------------------------------
insert into public.branches (slug, name, type, tagline, address, city, phone, email, lat, lng, description_md, hero_image_url, hours_text, is_published, sort_order)
values
  ('main-station',
   'Comffe Main Station',
   'cafe',
   'The flagship — 32 high-spec rigs, an espresso bar that runs hotter than the GPUs.',
   '12 Katipunan Ave, Loyola Heights',
   'Quezon City',
   '+63 917 000 0001',
   'main@comffe.ph',
   14.6398, 121.0795,
   E'## What you''ll find inside\n\nThirty-two RTX-class workstations on a custom mesh network, an old-fashioned espresso bar in the corner, and a wall of vintage monitors that double as the menu board. Open until 4am because the best runs happen after midnight.',
   'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=2400&q=80',
   'Mon–Sun · 8:00 AM → 4:00 AM',
   true, 1),

  ('night-circuit',
   'Comffe Night Circuit',
   'cafe',
   'Twenty-four hour gaming den with cold brew on tap and console couches in the back.',
   '88 Sct Borromeo St, Sacred Heart',
   'Quezon City',
   '+63 917 000 0002',
   'night@comffe.ph',
   14.6303, 121.0359,
   E'## Built for the late shift\n\nTwenty workstations, six PS5 stations, two private streaming booths, and a back room you can book by the hour. Cold brew, ramen, and a fridge full of energy drinks.',
   'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=2400&q=80',
   'Open 24 hours',
   true, 2),

  ('playcation-baguio',
   'Comffee Playcation · Baguio',
   'playcation',
   'A pine-scented loft with a full PS5 wall, mountain views, and barista-grade coffee on standby.',
   'Camp 7, Kennon Road',
   'Baguio City',
   '+63 917 000 0003',
   'baguio@comffe.ph',
   16.4023, 120.5960,
   E'## Stay. Play. Recharge.\n\nA self-contained loft for two with a full PlayStation 5 wall, fifty-inch OLED, blackout curtains, and a dedicated espresso corner. Sleeps four if you bring the futon. Three-minute walk to the nearest convenience store, ten to the nightlife.',
   'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=2400&q=80',
   'Check-in 3:00 PM · Check-out 11:00 AM',
   true, 3),

  ('playcation-laguna',
   'Comffee Playcation · Laguna',
   'playcation',
   'Lakeside cabin with a fiber line, two consoles, and an outdoor kitchen for the off-screen hours.',
   'Brgy. San Antonio, Lake Caliraya',
   'Lumban, Laguna',
   '+63 917 000 0004',
   'laguna@comffe.ph',
   14.2755, 121.5587,
   E'## Cabin mode engaged\n\nA private two-bedroom cabin with two PS5 stations, a 65" 4K display, fiber internet, and a deck that overlooks the lake. Outdoor kitchen, fire pit, and a hammock for when the boss fights wear you down.',
   'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=2400&q=80',
   'Check-in 2:00 PM · Check-out 11:00 AM',
   true, 4)
on conflict (slug) do nothing;

-- Amenities -------------------------------------------------------------------
do $$
declare b_main uuid; b_night uuid; b_baguio uuid; b_laguna uuid;
begin
  select id into b_main   from public.branches where slug = 'main-station';
  select id into b_night  from public.branches where slug = 'night-circuit';
  select id into b_baguio from public.branches where slug = 'playcation-baguio';
  select id into b_laguna from public.branches where slug = 'playcation-laguna';

  delete from public.branch_amenities where branch_id in (b_main, b_night, b_baguio, b_laguna);

  insert into public.branch_amenities (branch_id, icon, label, description, sort_order) values
    (b_main, 'monitor',     '32 high-spec PCs',   'RTX-class GPUs, 240Hz panels, mechanical boards', 1),
    (b_main, 'wifi',        '1 Gbps fiber',       'Wired ethernet at every station', 2),
    (b_main, 'coffee',      'Espresso bar',       'Real beans, real machine, real barista', 3),
    (b_main, 'headphones',  'Open-back audio',    'Beyerdynamic DT 770s on every rig', 4),
    (b_main, 'utensils',    'Ramen + snacks',     'Hot ramen, rice meals, sweet pastries', 5),
    (b_main, 'snowflake',   'Always cold',        'Industrial AC, never above 22°C', 6),

    (b_night, 'monitor',    '20 gaming PCs',      'Latest gen rigs', 1),
    (b_night, 'gamepad',    '6 PS5 stations',     'With premium controllers and headsets', 2),
    (b_night, 'video',      'Streaming booths',   'Two private rooms with cameras and lighting', 3),
    (b_night, 'wifi',       'Fiber internet',     'Wired and Wi-Fi 6', 4),
    (b_night, 'coffee',     'Cold brew on tap',   'And hot pour-over by request', 5),
    (b_night, 'moon',       '24 hours',           'Always open', 6),

    (b_baguio, 'gamepad',     'Full PS5 wall',     '50" OLED + premium DualSense controllers', 1),
    (b_baguio, 'bed',         'Sleeps 2 (4 max)',  'Queen bed, foldout futon for the squad', 2),
    (b_baguio, 'wifi',        'Fiber internet',    'Wired ethernet to the gaming corner', 3),
    (b_baguio, 'coffee',      'Espresso corner',   'Pump machine + freshly roasted beans included', 4),
    (b_baguio, 'mountain',    'Mountain views',    'Pine forest right outside the window', 5),
    (b_baguio, 'snowflake',   'Cool climate',      'No AC needed — Baguio''s built different', 6),

    (b_laguna, 'gamepad',     '2 PS5 stations',    '65" 4K display, both stations linkable for couch co-op', 1),
    (b_laguna, 'bed',         '2 bedrooms',        'Sleeps 6 comfortably', 2),
    (b_laguna, 'wifi',        'Fiber internet',    'Reliable for streaming and online play', 3),
    (b_laguna, 'utensils',    'Outdoor kitchen',   'Stove, sink, fridge, and grill', 4),
    (b_laguna, 'flame',       'Fire pit + hammock','For the off-screen hours', 5),
    (b_laguna, 'tree',        'Lakeside view',     'Right on Lake Caliraya', 6);

  -- Photos (multiple per branch for the cinematic gallery)
  delete from public.branch_photos where branch_id in (b_main, b_night, b_baguio, b_laguna);
  insert into public.branch_photos (branch_id, storage_path, public_url, caption, sort_order) values
    (b_main, 'seed/main-1.jpg', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=2400&q=80', 'The wall of rigs', 1),
    (b_main, 'seed/main-2.jpg', 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=2400&q=80', 'The espresso corner', 2),
    (b_main, 'seed/main-3.jpg', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=2400&q=80', 'Hardware on display', 3),
    (b_main, 'seed/main-4.jpg', 'https://images.unsplash.com/photo-1587202372616-b43abea06c2a?w=2400&q=80', 'Late night vibes', 4),

    (b_night, 'seed/night-1.jpg', 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=2400&q=80', 'Console couches in back', 1),
    (b_night, 'seed/night-2.jpg', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=2400&q=80', '24/7 gaming floor', 2),
    (b_night, 'seed/night-3.jpg', 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=2400&q=80', 'Streaming booth', 3),
    (b_night, 'seed/night-4.jpg', 'https://images.unsplash.com/photo-1499914485622-a88fac536970?w=2400&q=80', 'Cold brew on tap', 4),

    (b_baguio, 'seed/baguio-1.jpg', 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=2400&q=80', 'Mountain morning', 1),
    (b_baguio, 'seed/baguio-2.jpg', 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=2400&q=80', 'The PS5 wall', 2),
    (b_baguio, 'seed/baguio-3.jpg', 'https://images.unsplash.com/photo-1522444690501-83bdda9bdc26?w=2400&q=80', 'Living area', 3),
    (b_baguio, 'seed/baguio-4.jpg', 'https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=2400&q=80', 'Bedroom', 4),

    (b_laguna, 'seed/laguna-1.jpg', 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=2400&q=80', 'Lakeside cabin', 1),
    (b_laguna, 'seed/laguna-2.jpg', 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=2400&q=80', 'Deck with hammock', 2),
    (b_laguna, 'seed/laguna-3.jpg', 'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=2400&q=80', 'Living room with consoles', 3),
    (b_laguna, 'seed/laguna-4.jpg', 'https://images.unsplash.com/photo-1551516594-56cb78394645?w=2400&q=80', 'Outdoor kitchen', 4);

  -- Rates
  delete from public.branch_rates where branch_id in (b_main, b_night, b_baguio, b_laguna);
  insert into public.branch_rates (branch_id, category, label, description, price_php, unit, sort_order) values
    (b_main, 'internet', 'PC Standard',     'For browsing, study, casual play',  50,  'hour', 1),
    (b_main, 'internet', 'PC Pro',          'High-spec rigs, 240Hz, premium HID', 80,  'hour', 2),
    (b_main, 'internet', 'PC Pro · 5hr',    'Five-hour pack, save P50',         350, 'pack', 3),
    (b_main, 'internet', 'Overnight',       '10pm → 6am, all-you-can-game',     500, 'session', 4),

    (b_night, 'internet', 'PC Standard',    'Casual play / browsing',            55, 'hour', 1),
    (b_night, 'internet', 'PC Pro',         'Latest-gen rigs',                   85, 'hour', 2),
    (b_night, 'internet', 'PS5 Couch',      'Per console',                      120, 'hour', 3),
    (b_night, 'internet', 'Streaming Booth','Per booth, includes lighting',     250, 'hour', 4),

    (b_baguio, 'playcation', 'Whole Loft',  'Up to 4 guests, full unit',       3500, 'night', 1),
    (b_baguio, 'playcation', '3-Night Pack','15% off, includes welcome coffee',8900, 'pack',  2),
    (b_baguio, 'playcation', 'Day Use',     '11am → 8pm, no overnight',        1800, 'session', 3),

    (b_laguna, 'playcation', 'Whole Cabin', 'Up to 6 guests, full cabin',      4800, 'night', 1),
    (b_laguna, 'playcation', '3-Night Pack','15% off, includes lake kayak',  12200, 'pack',  2);
end $$;

-- Menu ------------------------------------------------------------------------
insert into public.menu_categories (slug, name, sort_order) values
  ('coffee',     'Coffee',     1),
  ('cold-bar',   'Cold Bar',   2),
  ('rice-meals', 'Rice Meals', 3),
  ('snacks',     'Snacks',     4),
  ('desserts',   'Desserts',   5)
on conflict (slug) do nothing;

do $$
declare c_coffee uuid; c_cold uuid; c_rice uuid; c_snacks uuid; c_desserts uuid;
begin
  select id into c_coffee   from public.menu_categories where slug = 'coffee';
  select id into c_cold     from public.menu_categories where slug = 'cold-bar';
  select id into c_rice     from public.menu_categories where slug = 'rice-meals';
  select id into c_snacks   from public.menu_categories where slug = 'snacks';
  select id into c_desserts from public.menu_categories where slug = 'desserts';

  delete from public.menu_items;
  insert into public.menu_items (category_id, name, description, base_price_php, photo_storage_path, is_global, available, sort_order) values
    (c_coffee, 'Espresso',         'Single shot, classic ratio',                    75, null, true, true, 1),
    (c_coffee, 'Americano',        'Espresso, hot water, no compromise',            90, null, true, true, 2),
    (c_coffee, 'Cappuccino',       'Espresso, steamed milk, dense foam',           110, null, true, true, 3),
    (c_coffee, 'Spanish Latte',    'Sweet condensed milk, double shot',            125, null, true, true, 4),
    (c_coffee, 'Mocha',            'Espresso, dark chocolate, steamed milk',       135, null, true, true, 5),
    (c_cold,   'Iced Latte',       'Cold milk, two shots, ice',                    115, null, true, true, 1),
    (c_cold,   'Cold Brew',        '18-hour steeped, no bitterness',               130, null, true, true, 2),
    (c_cold,   'Strawberry Cream', 'Pink, sweet, deeply unserious',                145, null, true, true, 3),
    (c_rice,   'Tapsilog',         'Beef tapa, garlic rice, sunny egg',            145, null, true, true, 1),
    (c_rice,   'Tocilog',          'Sweet pork tocino, garlic rice, egg',          135, null, true, true, 2),
    (c_rice,   'Adobo Bowl',       'Slow-cooked chicken adobo, garlic rice',       155, null, true, true, 3),
    (c_snacks, 'Cup Ramen',        'Spicy or original',                             80, null, true, true, 1),
    (c_snacks, 'Loaded Fries',     'Cheese, bacon bits, chives',                   135, null, true, true, 2),
    (c_snacks, 'Chicken Tenders',  'Five pieces, choice of dip',                   165, null, true, true, 3),
    (c_desserts, 'Cheesecake Slice', 'New York style',                              125, null, true, true, 1),
    (c_desserts, 'Brownie',          'Fudgy, with sea salt',                         95, null, true, true, 2);
end $$;
