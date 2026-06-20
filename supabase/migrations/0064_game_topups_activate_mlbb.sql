-- Mobile Legends → LIVE. Prices pulled 2026-06-21 from the live Codashop PH page (denomination/price
-- pairings verified in document order from the rendered SKU cards).
--
-- PRICING BASIS = REGULAR (owner decision 2026-06-21): MLBB is the only game whose Codashop page shows a
-- promo price with a struck-out REGULAR price (e.g. 56💎: regular ₱65, promo-now ₱53.20). We base our
-- "8% off" on the REGULAR price (margin-safe: staff buy on Codashop at most the regular price, less during
-- a promo = extra margin; no loss when the promo ends). customer_price = round(regular × 0.92).
--
-- NO AUTO-SYNC for MLBB: the generalized parser reads ONE visible price per tier; MLBB renders two
-- (promo + struck regular) plus first-recharge/pass SKUs, so it can't be parsed safely. We NULL its
-- codashop_url so the daily price-sync SKIPS it (manual pricing) instead of alerting "unreadable page"
-- every run. Revisit prices in admin Settings if Codashop's regular price changes.

update game_topup_catalog set codashop_price=13,   customer_price=12,   discount_pct=8, active=true, frozen=false where sku='mlbb-dia-11';
update game_topup_catalog set codashop_price=26,   customer_price=24,   discount_pct=8, active=true, frozen=false where sku='mlbb-dia-22';
update game_topup_catalog set codashop_price=65,   customer_price=60,   discount_pct=8, active=true, frozen=false where sku='mlbb-dia-56';
update game_topup_catalog set codashop_price=130,  customer_price=120,  discount_pct=8, active=true, frozen=false where sku='mlbb-dia-112';
update game_topup_catalog set codashop_price=260,  customer_price=239,  discount_pct=8, active=true, frozen=false where sku='mlbb-dia-223';
update game_topup_catalog set codashop_price=650,  customer_price=598,  discount_pct=8, active=true, frozen=false where sku='mlbb-dia-570';
update game_topup_catalog set codashop_price=1300, customer_price=1196, discount_pct=8, active=true, frozen=false where sku='mlbb-dia-1163';
update game_topup_catalog set codashop_price=2240, customer_price=2061, discount_pct=8, active=true, frozen=false where sku='mlbb-dia-2398';

-- Drop the codashop_url so the daily sync skips MLBB (manual pricing), then activate the game.
update game_topup_games set codashop_url=null, active=true where slug='mobile-legends';
