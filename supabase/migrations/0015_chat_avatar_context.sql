-- Add avatar URL to chat conversations so admin can see the customer's Google photo
alter table public.chat_conversations
  add column if not exists customer_avatar_url text,
  add column if not exists inquiry_check_in    date,
  add column if not exists inquiry_check_out   date;
