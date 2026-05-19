-- =============================================================
-- Row-Level Security policies
-- Public read for published marketing content; admin full access;
-- members own-row access for their reservations.
-- =============================================================

-- Enable RLS on every table -------------------------------------------------
alter table public.site_settings              enable row level security;
alter table public.admin_users                enable row level security;
alter table public.members                    enable row level security;
alter table public.branches                   enable row level security;
alter table public.admin_branch_assignments   enable row level security;
alter table public.branch_amenities           enable row level security;
alter table public.branch_photos              enable row level security;
alter table public.branch_rates               enable row level security;
alter table public.menu_categories            enable row level security;
alter table public.menu_items                 enable row level security;
alter table public.branch_menu_overrides      enable row level security;
alter table public.reservations               enable row level security;
alter table public.internet_reservations      enable row level security;
alter table public.orders                     enable row level security;
alter table public.order_items                enable row level security;
alter table public.airbnb_calendars           enable row level security;
alter table public.chat_conversations         enable row level security;
alter table public.chat_messages              enable row level security;
alter table public.admin_devices              enable row level security;
alter table public.paymongo_webhook_events    enable row level security;
alter table public.contact_form_submissions   enable row level security;
alter table public.audit_log                  enable row level security;

-- Site settings: public read for whitelisted keys; admin write -----------------
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select using (
    key in ('company_name','tagline','contact_phone','contact_email','address',
            'social_facebook','social_instagram','social_tiktok','hero_copy',
            'site_url','footer_blurb')
  );
drop policy if exists site_settings_admin_write on public.site_settings;
create policy site_settings_admin_write on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- Branches: public read published; admin full -------------------------------
drop policy if exists branches_public_read on public.branches;
create policy branches_public_read on public.branches
  for select using (is_published = true);
drop policy if exists branches_admin_all on public.branches;
create policy branches_admin_all on public.branches
  for all using (public.is_admin()) with check (public.is_admin());

-- Branch children (amenities/photos/rates) inherit visibility -----------------
drop policy if exists branch_amenities_public_read on public.branch_amenities;
create policy branch_amenities_public_read on public.branch_amenities
  for select using (
    exists (select 1 from public.branches b where b.id = branch_id and b.is_published)
  );
drop policy if exists branch_amenities_admin_all on public.branch_amenities;
create policy branch_amenities_admin_all on public.branch_amenities
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists branch_photos_public_read on public.branch_photos;
create policy branch_photos_public_read on public.branch_photos
  for select using (
    exists (select 1 from public.branches b where b.id = branch_id and b.is_published)
  );
drop policy if exists branch_photos_admin_all on public.branch_photos;
create policy branch_photos_admin_all on public.branch_photos
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists branch_rates_public_read on public.branch_rates;
create policy branch_rates_public_read on public.branch_rates
  for select using (
    exists (select 1 from public.branches b where b.id = branch_id and b.is_published)
  );
drop policy if exists branch_rates_admin_all on public.branch_rates;
create policy branch_rates_admin_all on public.branch_rates
  for all using (public.is_admin()) with check (public.is_admin());

-- Menu: public read available; admin full ------------------------------------
drop policy if exists menu_categories_public_read on public.menu_categories;
create policy menu_categories_public_read on public.menu_categories
  for select using (true);
drop policy if exists menu_categories_admin_all on public.menu_categories;
create policy menu_categories_admin_all on public.menu_categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists menu_items_public_read on public.menu_items;
create policy menu_items_public_read on public.menu_items
  for select using (available = true);
drop policy if exists menu_items_admin_all on public.menu_items;
create policy menu_items_admin_all on public.menu_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists branch_menu_overrides_public_read on public.branch_menu_overrides;
create policy branch_menu_overrides_public_read on public.branch_menu_overrides
  for select using (
    exists (select 1 from public.branches b where b.id = branch_id and b.is_published)
  );
drop policy if exists branch_menu_overrides_admin_all on public.branch_menu_overrides;
create policy branch_menu_overrides_admin_all on public.branch_menu_overrides
  for all using (public.is_admin()) with check (public.is_admin());

-- Admin users: admin-only -----------------------------------------------------
drop policy if exists admin_users_self_or_admin on public.admin_users;
create policy admin_users_self_or_admin on public.admin_users
  for select using (auth_user_id = auth.uid() or public.is_admin());
drop policy if exists admin_users_admin_write on public.admin_users;
create policy admin_users_admin_write on public.admin_users
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_branch_assignments_admin_all on public.admin_branch_assignments;
create policy admin_branch_assignments_admin_all on public.admin_branch_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- Members: own row + admin ---------------------------------------------------
drop policy if exists members_self_select on public.members;
create policy members_self_select on public.members
  for select using (auth_user_id = auth.uid() or public.is_admin());
drop policy if exists members_self_update on public.members;
create policy members_self_update on public.members
  for update using (auth_user_id = auth.uid() or public.is_admin())
  with check (auth_user_id = auth.uid() or public.is_admin());
drop policy if exists members_admin_all on public.members;
create policy members_admin_all on public.members
  for all using (public.is_admin()) with check (public.is_admin());

-- Reservations: read your own holds; admin all -------------------------------
drop policy if exists reservations_admin_all on public.reservations;
create policy reservations_admin_all on public.reservations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists internet_reservations_self on public.internet_reservations;
create policy internet_reservations_self on public.internet_reservations
  for select using (
    public.is_admin() or
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );
drop policy if exists internet_reservations_admin_all on public.internet_reservations;
create policy internet_reservations_admin_all on public.internet_reservations
  for all using (public.is_admin()) with check (public.is_admin());

-- Orders: admin only for now (customer access TBD in Phase 3) ----------------
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- Calendars / chat / devices / webhooks: admin only --------------------------
drop policy if exists airbnb_calendars_admin_all on public.airbnb_calendars;
create policy airbnb_calendars_admin_all on public.airbnb_calendars
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists chat_conversations_admin_all on public.chat_conversations;
create policy chat_conversations_admin_all on public.chat_conversations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists chat_messages_admin_all on public.chat_messages;
create policy chat_messages_admin_all on public.chat_messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_devices_self on public.admin_devices;
create policy admin_devices_self on public.admin_devices
  for all using (
    admin_user_id in (select id from public.admin_users where auth_user_id = auth.uid())
    or public.is_admin()
  ) with check (
    admin_user_id in (select id from public.admin_users where auth_user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists paymongo_webhook_events_admin_all on public.paymongo_webhook_events;
create policy paymongo_webhook_events_admin_all on public.paymongo_webhook_events
  for all using (public.is_admin()) with check (public.is_admin());

-- Contact form: anonymous insert allowed; admin read ------------------------
drop policy if exists contact_form_anon_insert on public.contact_form_submissions;
create policy contact_form_anon_insert on public.contact_form_submissions
  for insert with check (true);
drop policy if exists contact_form_admin_all on public.contact_form_submissions;
create policy contact_form_admin_all on public.contact_form_submissions
  for all using (public.is_admin()) with check (public.is_admin());

-- Audit log: admin read only -------------------------------------------------
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select using (public.is_admin());
