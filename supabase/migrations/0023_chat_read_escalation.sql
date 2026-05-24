-- Chat read-tracking + unanswered-message escalation.
--   admin_last_read_at      - when an admin last opened/read the conversation (for "seen")
--   escalation_last_sent_at - when the last "unanswered" reminder email was sent
alter table public.chat_conversations
  add column if not exists admin_last_read_at      timestamptz,
  add column if not exists escalation_last_sent_at timestamptz;
