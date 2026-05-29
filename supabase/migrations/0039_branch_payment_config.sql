-- 0039: per-branch online-payment configuration (Settings → "Online Payments")
--
-- WHY: each cafe owner sets up their OWN online-payment method in the POS Settings screen
-- (flowchart §A). This table is the single per-branch row that holds those choices. The POS
-- (running on the cafe server, using the trusted service-role key) WRITES it; the website only
-- READS it server-side to decide whether to offer online reservations and what fee / bonus to
-- show the customer.
--
-- SECRETS LIVE HERE. paymongo_secret_key + paymongo_webhook_secret are the owner's PayMongo
-- credentials. They must NEVER reach a browser. Hence: RLS enabled, and NO public/anon/authenticated
-- select policy at all — only the service-role key (which bypasses RLS) can read or write. The
-- website reads it exclusively through getSupabaseAdmin() in server code, and only ever sends the
-- non-secret fields (method, fee, mins, bonus display) to the client.
--
-- Design notes / things considered:
--  - One row per branch (branch_id is the PK, FK to branches, cascade on delete) — there is exactly
--    one active online-payment setup per cafe at a time (flowchart §A: "pick ONE active").
--  - online_payment_method is plain text, not an enum, so the POS can evolve it ('' = none picked,
--    'gcash_personal', 'paymongo'; 'gcash_business' is parked "coming soon"). '' (empty) is the
--    default = no online payments, no reservations.
--  - fee_per_100 is the COUNTER online-payment fee (₱ per full ₱100, default ₱1) — flowchart §E.
--    The ONLINE-RESERVATION fee is a separate FLAT ₱10 and is NOT stored here (it's hardcoded in
--    the website + POS so the two can never drift apart). This column is kept for the counter-sale
--    feature; the reservation path ignores it.
--  - bonus_* are the MEMBERS-ONLY top-up bonus DISPLAY settings (flowchart §G/§K). The website only
--    SHOWS the resulting bonus to the customer; PanCafe APPLIES the real bonus. Stored so the
--    reservation page can compute the display string ("Top up ₱200 → get ₱250").
--
-- [[comffee-saas-vision]] Online Payments & Reservations — Chunk 5/6 (website side).

create table if not exists public.branch_payment_config (
  branch_id              uuid primary key references public.branches(id) on delete cascade,

  -- '' = none picked (no online payments, no reservations) | 'gcash_personal' | 'paymongo'
  -- ('gcash_business' reserved for later; greyed "coming soon" in the POS).
  online_payment_method  text not null default '',

  -- Owner's PayMongo credentials — SECRET, service-role read only (see RLS below).
  paymongo_secret_key    text,
  paymongo_webhook_secret text,

  -- Counter online-payment fee: ₱ per full ₱100 (flowchart §E). Reservation fee is a separate
  -- flat ₱10 and is intentionally NOT stored here.
  fee_per_100            numeric not null default 1,

  -- Reservation rules (only meaningful when online_payment_method = 'paymongo', flowchart §A).
  reservation_min_hours  numeric not null default 1,   -- walk-in must book at least this many hours
  reservation_min_topup  numeric not null default 0,   -- member must top up at least this much

  -- Members-only top-up bonus DISPLAY settings (website shows it; PanCafe applies the real bonus).
  bonus_type             text not null default 'percent',  -- 'percent' | 'fixed'
  bonus_value            numeric not null default 0,        -- percent (e.g. 25 = +25%) or fixed peso amount
  bonus_threshold        numeric not null default 0,        -- only show a bonus when top-up >= this (0 = always)

  updated_at             timestamptz not null default now()
);

-- RLS: locked down to the service role only. NO public/anon/authenticated select — this row holds
-- the owner's PayMongo secret + webhook secret. The website reads it via the service-role key in
-- server code; the POS writes it via the service-role key. Enabling RLS with zero policies means
-- every non-service-role request (anon key, signed-in member, etc.) is denied. The service-role key
-- bypasses RLS entirely, so it still has full read/write.
alter table public.branch_payment_config enable row level security;
