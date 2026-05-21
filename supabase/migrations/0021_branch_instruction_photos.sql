alter table public.branches
  add column if not exists checkin_photo_url  text,
  add column if not exists checkout_photo_url text;
