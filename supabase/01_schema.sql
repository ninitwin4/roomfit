-- roomfit — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Single role: every signed-in user can browse all rooms and manage their own
-- listings. Seed rooms have owner_id = null and belong to nobody.

create table if not exists rooms (
  id              bigint generated always as identity primary key,
  title           text    not null,
  rent            integer not null check (rent >= 0),
  location        text    not null,
  cleanliness     smallint not null check (cleanliness between 1 and 5),
  social_level    smallint not null check (social_level between 1 and 5),
  sleep_schedule  text    not null check (sleep_schedule in ('early','late','flexible')),
  pets_allowed    boolean not null default false,
  smoking_allowed boolean not null default false,
  owner_id        uuid    references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);

alter table rooms enable row level security;

-- Anyone signed in can see every room. Browsing is the whole point.
create policy "signed-in users can read all rooms"
  on rooms for select
  to authenticated
  using (true);

-- You may only create a listing owned by you.
create policy "users insert their own listings"
  on rooms for insert
  to authenticated
  with check (owner_id = auth.uid());

-- You may only edit or delete your own listing. Seed rooms (owner_id null)
-- are read-only for everyone.
create policy "users update their own listings"
  on rooms for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "users delete their own listings"
  on rooms for delete
  to authenticated
  using (owner_id = auth.uid());

create index if not exists rooms_owner_idx on rooms (owner_id);
