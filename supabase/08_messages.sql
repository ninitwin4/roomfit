-- roomfit — in-app messaging
-- Run AFTER 07_avatars.sql, in the Supabase SQL editor.
-- Additive and guarded: safe to run on the live database.

-- One table, no separate `conversations`. A thread is implicitly identified by
-- (room_id, the other participant).
--
-- That choice is what keeps the policies safe: the read policy below touches no
-- other table, so "infinite recursion detected in policy" is structurally
-- impossible. A conversations+messages pair invites exactly that, because each
-- table's policy ends up querying the other.
create table if not exists messages (
  id           bigint generated always as identity primary key,
  room_id      bigint not null references rooms(id)      on delete cascade,
  sender_id    uuid   not null references auth.users(id) on delete cascade,
  recipient_id uuid   not null references auth.users(id) on delete cascade,
  body         text   not null check (length(btrim(body)) between 1 and 2000),
  read_at      timestamptz,   -- reserved; unread is tracked client-side for now
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

alter table messages enable row level security;

-- You can read a message only if you're one of the two people in it.
create policy "participants read their messages"
  on messages for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- You can only send as yourself, and never to yourself.
create policy "users send as themselves"
  on messages for insert
  to authenticated
  with check (sender_id = auth.uid() and recipient_id <> auth.uid());

-- No UPDATE and no DELETE policy: messages are immutable.
--
-- This is deliberate. A "mark as read" update policy scoped to recipient_id
-- would also let the recipient rewrite `body`, because RLS is row-level, not
-- column-level. Column grants can fix that, but they're fragile — any later
-- blanket GRANT silently re-widens them. Simpler to leave messages immutable
-- and track unread state client-side.

create index if not exists messages_thread_idx    on messages (room_id, created_at);
create index if not exists messages_recipient_idx on messages (recipient_id, created_at desc);
create index if not exists messages_sender_idx    on messages (sender_id, created_at desc);

-- Seed rooms keep owner_id = null and are deliberately not messageable — the
-- app labels them "Sample listing" and hides the Message button, so there is
-- no need to invent an owner account for them.
