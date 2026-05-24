-- Read-only "partner" admin role: can view everything (dashboard, sales, chats),
-- but cannot edit anything or send chat messages. Enforced in app code.
alter type admin_role add value if not exists 'partner';
