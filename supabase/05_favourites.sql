-- roomfit — saved / favourite rooms
-- Run AFTER 04_photos_multi.sql, in the Supabase SQL editor.
-- Additive and guarded: safe to run on the live database.

-- One row per (user, room) they've saved.
-- The composite primary key is doing real work here: it makes saving the same
-- room twice impossible at the database level, so the UI never has to check
-- first, and a double-tap can't create a duplicate.
create table if not exists favourites (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  room_id    bigint not null references rooms(id)      on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

alter table favourites enable row level security;

-- Your saved rooms are yours alone — unlike rooms, these are never public.
create policy "users read their own favourites"
  on favourites for select
  to authenticated
  using (user_id = auth.uid());

create policy "users add their own favourites"
  on favourites for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users remove their own favourites"
  on favourites for delete
  to authenticated
  using (user_id = auth.uid());

-- No UPDATE policy on purpose: a favourite either exists or it doesn't, so
-- there is nothing to edit and nothing to get wrong.

-- Lists a user's saves newest-first without touching the table's heap.
create index if not exists favourites_user_idx
  on favourites (user_id, created_at desc);

-- Note: `on delete cascade` on room_id means deleting a room automatically
-- clears it from everyone's saved list. No orphan cleanup needed.
