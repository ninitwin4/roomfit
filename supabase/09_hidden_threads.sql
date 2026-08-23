-- roomfit — hide a conversation from your own inbox
-- Run AFTER 08_messages.sql, in the Supabase SQL editor.
-- Additive and guarded: safe to run on the live database.

-- Deliberately NOT a delete. Messages stay immutable (08_messages.sql explains
-- why), and one person should never be able to erase the other person's record
-- of a conversation. This table only records "I don't want to see this thread",
-- per user.
--
-- created_at is the point in time you hid it, not just a flag. The inbox
-- re-surfaces a hidden thread once a newer message arrives — otherwise hiding
-- someone would silently swallow everything they send you afterwards.
create table if not exists hidden_threads (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  room_id    bigint not null references rooms(id)      on delete cascade,
  other_id   uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id, other_id)
);

alter table hidden_threads enable row level security;

-- Yours alone, in every direction.
create policy "users read their own hidden threads"
  on hidden_threads for select
  to authenticated
  using (user_id = auth.uid());

create policy "users hide their own threads"
  on hidden_threads for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users unhide their own threads"
  on hidden_threads for delete
  to authenticated
  using (user_id = auth.uid());

-- An UPDATE policy would only let someone rewrite their own hide timestamp,
-- which has no use; re-hiding just replaces the row.
