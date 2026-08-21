-- roomfit — user profiles (names now; avatars and social links later)
-- Run AFTER 05_favourites.sql, in the Supabase SQL editor.
-- Additive and guarded: safe to run on the live database.

-- A row per user, created when they finish signing up.
--
-- Why a table rather than auth.users.user_metadata: the auth schema isn't
-- exposed through PostgREST, so no RLS policy can let one user read another's
-- metadata. Metadata could show you your own name and nothing else — useless
-- the moment we want a room owner's name next to their listing.
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name  text,
  avatar_url text,        -- reserved for the avatars phase; unused for now
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Readable by any signed-in user: names are meant to be seen next to listings.
-- Note this is deliberately NOT public — anonymous visitors get nothing.
create policy "signed-in users can read all profiles"
  on profiles for select
  to authenticated
  using (true);

create policy "users insert their own profile"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "users update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No DELETE policy: a profile dies with its auth.users row via the cascade.
