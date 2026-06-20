-- League of Legends, Wild Rift, Genshin Impact → LIVE with real Codashop PH prices (pulled 2026-06-21
-- from the live pages, pairings verified in document order). customer_price = round(codashop_price × 0.92)
-- = 8% below Codashop. Codashop's own parser is VP-only, so these are manually priced for now (the daily
-- price-sync skips non-VP games) — adjust in admin Settings, or we generalize the parser later.

-- ── Wild Rift (Wild Cores) ──
update game_topup_catalog set codashop_price=200,  customer_price=184,  active=true, frozen=false where sku='wildrift-wc-425';
update game_topup_catalog set codashop_price=449,  customer_price=413,  active=true, frozen=false where sku='wildrift-wc-1000';
update game_topup_catalog set codashop_price=819,  customer_price=753,  active=true, frozen=false where sku='wildrift-wc-1850';
update game_topup_catalog set codashop_price=1430, customer_price=1316, active=true, frozen=false where sku='wildrift-wc-3275';
update game_topup_catalog set codashop_price=2050, customer_price=1886, active=true, frozen=false where sku='wildrift-wc-4800';
update game_topup_catalog set codashop_price=4090, customer_price=3763, active=true, frozen=false where sku='wildrift-wc-10000';

-- ── League of Legends (RP) — refresh to live prices + activate ──
update game_topup_catalog set codashop_price=199,  customer_price=183,  active=true, frozen=false where sku='lol-rp-575';
update game_topup_catalog set codashop_price=449,  customer_price=413,  active=true, frozen=false where sku='lol-rp-1380';
update game_topup_catalog set codashop_price=899,  customer_price=827,  active=true, frozen=false where sku='lol-rp-2800';
update game_topup_catalog set codashop_price=1399, customer_price=1287, active=true, frozen=false where sku='lol-rp-4500';
update game_topup_catalog set codashop_price=1999, customer_price=1839, active=true, frozen=false where sku='lol-rp-6500';
update game_topup_catalog set codashop_price=3999, customer_price=3679, active=true, frozen=false where sku='lol-rp-13500';

-- ── Genshin Impact (Genesis Crystals) ──
-- Codashop headlines the bonus-inclusive TOTAL the account receives (e.g. "330 = 300+30"); replace the
-- base-amount placeholders from 0061 with those totals at the live tile prices, so what we show = what
-- they get. No genshin orders exist yet (was inactive) → safe to delete + reinsert.
delete from game_topup_catalog where game='genshin-impact';
insert into game_topup_catalog (sku, game, region, vp_amount, label, codashop_price, discount_pct, customer_price, active, frozen, source_url, sort_order) values
  ('genshin-gc-60',   'genshin-impact','PH',   60, '60 Genesis Crystals',     55, 8,   51, true, false, 'https://www.codashop.com/en-ph/genshin-impact', 1),
  ('genshin-gc-330',  'genshin-impact','PH',  330, '330 Genesis Crystals',   280, 8,  258, true, false, 'https://www.codashop.com/en-ph/genshin-impact', 2),
  ('genshin-gc-1090', 'genshin-impact','PH', 1090, '1090 Genesis Crystals',  830, 8,  764, true, false, 'https://www.codashop.com/en-ph/genshin-impact', 3),
  ('genshin-gc-2240', 'genshin-impact','PH', 2240, '2240 Genesis Crystals', 1670, 8, 1536, true, false, 'https://www.codashop.com/en-ph/genshin-impact', 4),
  ('genshin-gc-3880', 'genshin-impact','PH', 3880, '3880 Genesis Crystals', 2800, 8, 2576, true, false, 'https://www.codashop.com/en-ph/genshin-impact', 5),
  ('genshin-gc-8080', 'genshin-impact','PH', 8080, '8080 Genesis Crystals', 5500, 8, 5060, true, false, 'https://www.codashop.com/en-ph/genshin-impact', 6)
on conflict (sku) do update set
  vp_amount=excluded.vp_amount, label=excluded.label, codashop_price=excluded.codashop_price,
  customer_price=excluded.customer_price, active=true, frozen=false;

-- ── Activate the three games ──
update game_topup_games set active=true where slug in ('league-of-legends','wild-rift','genshin-impact');
