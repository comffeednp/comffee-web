-- Link playcation reservations and chat conversations to the booking member
alter table public.reservations
  add column if not exists member_id uuid references public.members(id) on delete set null;

create index if not exists reservations_member_idx
  on public.reservations (member_id);

alter table public.chat_conversations
  add column if not exists member_id uuid references public.members(id) on delete set null;

create index if not exists chat_conversations_member_idx
  on public.chat_conversations (member_id);
