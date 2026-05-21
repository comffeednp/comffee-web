alter table public.chat_conversations
  add column if not exists last_message_body        text,
  add column if not exists last_message_sender_type text;

-- backfill existing conversations with their most recent message
update public.chat_conversations c
set
  last_message_body        = sub.body,
  last_message_sender_type = sub.sender_type
from (
  select distinct on (conversation_id)
    conversation_id, body, sender_type
  from public.chat_messages
  order by conversation_id, created_at desc
) sub
where c.id = sub.conversation_id;
