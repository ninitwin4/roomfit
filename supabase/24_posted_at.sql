-- roomfit — when each listing was posted, shown on every card ("Posted 3 days ago").
-- Run AFTER 23_remove_sample_listings.sql, in the Supabase SQL editor.
-- Undo: undo/undo_24_posted_at.sql
--
-- rooms.posted_at is public, like the rest of a listing:
--   * imported rooms: the original post's date, so the card says how fresh the
--     ROOM is, not when we copied it. It's kept in sync from
--     room_sources.posted_at, which stays admin-only along with the post link
--     and the reply address;
--   * rooms added in the app: when they were added.
-- Set by the database, never by the app: an owner can't make an old listing
-- look new. Admins can set it (the date posted on a copied post). It stays the
-- same when a listing is claimed, renewed or edited.
--
-- Run this BEFORE deploying the app change that reads posted_at.


-- 1. The column, filled in for every existing room --------------------------------
alter table public.rooms add column if not exists posted_at timestamptz;

update public.rooms r
   set posted_at = s.posted_at
  from public.room_sources s
 where s.room_id = r.id
   and s.posted_at is not null
   and r.posted_at is null;

update public.rooms
   set posted_at = created_at
 where posted_at is null;

alter table public.rooms alter column posted_at set default now();
alter table public.rooms alter column posted_at set not null;


-- 2. Only the database (or an admin) sets it ---------------------------------------
-- Same pattern as protect_room_origin (15) and set_listing_expiry (17):
-- requests from the app run as 'authenticated'.
create or replace function public.protect_room_posted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.posted_at := now();
    else
      new.posted_at := old.posted_at;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_room_posted_at() from public, anon, authenticated;

drop trigger if exists protect_room_posted_at on public.rooms;
create trigger protect_room_posted_at
  before insert or update on public.rooms
  for each row execute function public.protect_room_posted_at();


-- 3. An import's post date reaches the room ---------------------------------------
-- import_listing() inserts the room first (posted now) and its room_sources row
-- second, with the post's date; this copies that date onto the room. Security
-- definer, because the room may belong to someone else by the time an admin
-- corrects the date.
create or replace function public.copy_source_posted_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.posted_at is not null then
    update public.rooms set posted_at = new.posted_at where id = new.room_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.copy_source_posted_at() from public, anon, authenticated;

drop trigger if exists copy_source_posted_at on public.room_sources;
create trigger copy_source_posted_at
  after insert or update of posted_at on public.room_sources
  for each row execute function public.copy_source_posted_at();
