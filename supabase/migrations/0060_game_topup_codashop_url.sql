-- 0060_game_topup_codashop_url.sql   (project: uioeefxnugnqhvthaxjf — comffee-web)
-- Set the Codashop price-page URL for Valorant so the daily price-sync (/api/cron/game-topup-price-sync)
-- can read live VP→₱ prices. Idempotent. Add a row's URL here (or via admin) to enable auto-pricing for
-- another game.

update public.game_topup_games
set codashop_url = 'https://www.codashop.com/en-ph/valorant'
where slug = 'valorant';
