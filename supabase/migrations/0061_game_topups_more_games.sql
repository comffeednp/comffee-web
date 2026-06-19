-- Game Top-Ups: scaffold 4 more games so launching one is a flip, not a build.
-- All seeded INACTIVE (game.active=false AND every catalog row active=false) so nothing can sell until
-- the owner reviews + activates it. Codashop URLs are VERIFIED-live (2026-06-20). Denominations come from
-- the live Codashop PH pages. PRICES: only League of Legends has verified per-tier ₱ (seeded); the other
-- three seed codashop_price/customer_price = 0 as placeholders — the owner runs "Pull now" (or the daily
-- cron, once the game is active) to fill real prices, OR types them once in Settings. Because the rows are
-- inactive, the cron skips them and they never sell at ₱0. Per-game art + accent live in
-- src/lib/game-topups/games-art.ts (front-end, keyed by these slugs).
-- customer_price = round(codashop_price × (1 − 8%)).

-- ── Games (inactive; LoL already exists from 0059 → just set its Codashop URL) ──
insert into public.game_topup_games (slug, name, region_default, currency_label, codashop_url, sort_order, active)
values
  ('mobile-legends',  'Mobile Legends', 'PH', 'Diamonds',         'https://www.codashop.com/en-ph/mobile-legends',                3, false),
  ('wild-rift',       'Wild Rift',      'PH', 'Wild Cores',       'https://www.codashop.com/en-ph/league-of-legends-wild-rift',   4, false),
  ('genshin-impact',  'Genshin Impact', 'PH', 'Genesis Crystals', 'https://www.codashop.com/en-ph/genshin-impact',                5, false)
on conflict (slug) do update
  set codashop_url = excluded.codashop_url,
      currency_label = excluded.currency_label,
      sort_order = excluded.sort_order;

update public.game_topup_games
  set codashop_url = 'https://www.codashop.com/en-ph/league-of-legends'
  where slug = 'league-of-legends' and codashop_url is null;

-- ── League of Legends (PC) RP — VERIFIED prices, still INACTIVE pending owner go ──
insert into public.game_topup_catalog (sku, game, region, vp_amount, label, codashop_price, discount_pct, customer_price, active, source_url, sort_order)
values
  ('lol-rp-575',   'league-of-legends', 'PH',   575, '575 RP',     199,  8,  183, false, 'https://www.codashop.com/en-ph/league-of-legends', 1),
  ('lol-rp-1380',  'league-of-legends', 'PH',  1380, '1380 RP',    449,  8,  413, false, 'https://www.codashop.com/en-ph/league-of-legends', 2),
  ('lol-rp-2800',  'league-of-legends', 'PH',  2800, '2800 RP',    899,  8,  827, false, 'https://www.codashop.com/en-ph/league-of-legends', 3),
  ('lol-rp-4500',  'league-of-legends', 'PH',  4500, '4500 RP',   1399,  8, 1287, false, 'https://www.codashop.com/en-ph/league-of-legends', 4),
  ('lol-rp-6500',  'league-of-legends', 'PH',  6500, '6500 RP',   1999,  8, 1839, false, 'https://www.codashop.com/en-ph/league-of-legends', 5),
  ('lol-rp-13500', 'league-of-legends', 'PH', 13500, '13500 RP',  3999,  8, 3679, false, 'https://www.codashop.com/en-ph/league-of-legends', 6)
on conflict (sku) do nothing;

-- ── Wild Rift — Wild Cores (denominations verified; prices auto-pull at launch) ──
insert into public.game_topup_catalog (sku, game, region, vp_amount, label, codashop_price, discount_pct, customer_price, active, source_url, sort_order)
values
  ('wildrift-wc-425',   'wild-rift', 'PH',   425, '425 Wild Cores',   0, 8, 0, false, 'https://www.codashop.com/en-ph/league-of-legends-wild-rift', 1),
  ('wildrift-wc-1000',  'wild-rift', 'PH',  1000, '1000 Wild Cores',  0, 8, 0, false, 'https://www.codashop.com/en-ph/league-of-legends-wild-rift', 2),
  ('wildrift-wc-1850',  'wild-rift', 'PH',  1850, '1850 Wild Cores',  0, 8, 0, false, 'https://www.codashop.com/en-ph/league-of-legends-wild-rift', 3),
  ('wildrift-wc-3275',  'wild-rift', 'PH',  3275, '3275 Wild Cores',  0, 8, 0, false, 'https://www.codashop.com/en-ph/league-of-legends-wild-rift', 4),
  ('wildrift-wc-4800',  'wild-rift', 'PH',  4800, '4800 Wild Cores',  0, 8, 0, false, 'https://www.codashop.com/en-ph/league-of-legends-wild-rift', 5),
  ('wildrift-wc-10000', 'wild-rift', 'PH', 10000, '10000 Wild Cores', 0, 8, 0, false, 'https://www.codashop.com/en-ph/league-of-legends-wild-rift', 6)
on conflict (sku) do nothing;

-- ── Genshin Impact — Genesis Crystals (BASE amounts; bonuses are promo/display-only) ──
insert into public.game_topup_catalog (sku, game, region, vp_amount, label, codashop_price, discount_pct, customer_price, active, source_url, sort_order)
values
  ('genshin-gc-60',   'genshin-impact', 'PH',   60, '60 Genesis Crystals',   0, 8, 0, false, 'https://www.codashop.com/en-ph/genshin-impact', 1),
  ('genshin-gc-300',  'genshin-impact', 'PH',  300, '300 Genesis Crystals',  0, 8, 0, false, 'https://www.codashop.com/en-ph/genshin-impact', 2),
  ('genshin-gc-980',  'genshin-impact', 'PH',  980, '980 Genesis Crystals',  0, 8, 0, false, 'https://www.codashop.com/en-ph/genshin-impact', 3),
  ('genshin-gc-1980', 'genshin-impact', 'PH', 1980, '1980 Genesis Crystals', 0, 8, 0, false, 'https://www.codashop.com/en-ph/genshin-impact', 4),
  ('genshin-gc-3280', 'genshin-impact', 'PH', 3280, '3280 Genesis Crystals', 0, 8, 0, false, 'https://www.codashop.com/en-ph/genshin-impact', 5),
  ('genshin-gc-6480', 'genshin-impact', 'PH', 6480, '6480 Genesis Crystals', 0, 8, 0, false, 'https://www.codashop.com/en-ph/genshin-impact', 6)
on conflict (sku) do nothing;

-- ── Mobile Legends — Diamonds (total-delivered tiers as Codashop displays them) ──
insert into public.game_topup_catalog (sku, game, region, vp_amount, label, codashop_price, discount_pct, customer_price, active, source_url, sort_order)
values
  ('mlbb-dia-11',   'mobile-legends', 'PH',   11, '11 Diamonds',   0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 1),
  ('mlbb-dia-22',   'mobile-legends', 'PH',   22, '22 Diamonds',   0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 2),
  ('mlbb-dia-56',   'mobile-legends', 'PH',   56, '56 Diamonds',   0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 3),
  ('mlbb-dia-112',  'mobile-legends', 'PH',  112, '112 Diamonds',  0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 4),
  ('mlbb-dia-223',  'mobile-legends', 'PH',  223, '223 Diamonds',  0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 5),
  ('mlbb-dia-570',  'mobile-legends', 'PH',  570, '570 Diamonds',  0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 6),
  ('mlbb-dia-1163', 'mobile-legends', 'PH', 1163, '1163 Diamonds', 0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 7),
  ('mlbb-dia-2398', 'mobile-legends', 'PH', 2398, '2398 Diamonds', 0, 8, 0, false, 'https://www.codashop.com/en-ph/mobile-legends', 8)
on conflict (sku) do nothing;
