-- Multi-game / multi-account carts: move GAME + ACCOUNT from the order level down to each order LINE, so
-- one order (one payment, one receipt) can hold top-ups for several games + accounts, each screenshot-
-- verified on its own. The order becomes a pure payment/receipt envelope. Additive + idempotent; backfills
-- existing rows from the parent order so nothing breaks before the app code switches over. No RLS changes
-- needed (all order/line writes are service-role; admin-read still covers the new columns).

-- 1) Line-level game + generic account (covers Riot Name#TAG, Genshin UID+server, MLBB UserID+Zone) +
--    per-account screenshot proof. account_verified is the SCREENSHOT check (pre-pay), distinct from the
--    line's `status` (pending→verified = fulfilled/delivered).
alter table public.game_topup_order_lines
  add column if not exists game             text,
  add column if not exists region           text,
  add column if not exists account_id       text,   -- Riot name / Genshin UID / MLBB User ID
  add column if not exists account_tag      text,    -- Riot #TAG / Genshin server / MLBB Zone (nullable)
  add column if not exists account_verified boolean not null default false,
  add column if not exists screenshot_path  text;

-- 2) Backfill existing lines from their parent order (each legacy order is one game/account → copy down).
update public.game_topup_order_lines l
set game             = coalesce(l.game, o.game),
    region           = coalesce(l.region, o.region),
    account_id       = coalesce(l.account_id, o.riot_id),
    account_tag      = coalesce(l.account_tag, o.riot_tag),
    account_verified = coalesce(l.account_verified, o.verified),
    screenshot_path  = coalesce(l.screenshot_path, o.screenshot_path)
from public.game_topup_orders o
where l.order_id = o.id
  and (l.game is null or l.account_id is null);

-- 3) Admin "segregate one order per (game, account)" grouping.
create index if not exists game_topup_order_lines_group_idx
  on public.game_topup_order_lines (order_id, game, account_id, account_tag, position);

-- 4) Fulfilment match-by-account at the line level (replaces the order-level lower(riot_id) lookup):
--    find the open line by game + account + exact amount.
create index if not exists game_topup_order_lines_match_idx
  on public.game_topup_order_lines (game, lower(account_id), vp_amount, status);

-- 5) The order no longer needs a single account identity — relax the legacy single-account NOT NULLs so a
--    multi-account order doesn't have to pick one. Columns stay (nullable) for back-compat; drop later once
--    no code reads order.riot_id / order.game.
alter table public.game_topup_orders
  alter column riot_id  drop not null,
  alter column riot_tag drop not null;

-- NOTE (follow-up migration, AFTER every write path populates the line columns): make line.game +
-- line.account_id NOT NULL.
