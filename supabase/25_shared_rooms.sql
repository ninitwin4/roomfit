-- roomfit — public links to single rooms (app.joinroomfit.com/r/<id>).
-- Run AFTER 24_posted_at.sql, in the Supabase SQL editor.
-- Undo: undo/undo_25_shared_rooms.sql
--
-- Signed-out visitors still can't read the rooms table: every policy on it is
-- for signed-in users, and that doesn't change here. Instead a room's owner
-- opts in (rooms.shared, off by default), and get_shared_room() hands anyone
-- with the link that one room's public facts. Nothing else is opened up:
--   * only live, unexpired rooms that are shared;
--   * never an unclaimed Craigslist import: it's a copy of someone else's post
--     with no owner yet, so there's nobody who could have agreed to share it;
--   * only the listing's own columns and the owner's first name and avatar.
--     Never the owner's id, email or last name, and nothing from room_sources
--     (the original post link and reply address stay admin-only).
--
-- Room ids count up, so anyone can try /r/1, /r/2, … and find every shared
-- room. That's intended: shared means public. Unshared rooms return nothing.
--
-- Run this BEFORE deploying the app change that reads rooms.shared.


-- 1. The owner's choice ------------------------------------------------------------
-- Owners set it through the existing "users update their own listings" policy.
alter table public.rooms add column if not exists shared boolean not null default false;


-- 2. A new owner decides for themselves --------------------------------------------
-- When a room changes hands (a claim), the previous owner's choice to share it
-- doesn't carry over: a link the team posted stops working until the new owner
-- shares the room themselves.
create or replace function public.unshare_on_new_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    new.shared := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.unshare_on_new_owner() from public, anon, authenticated;

drop trigger if exists unshare_on_new_owner on public.rooms;
create trigger unshare_on_new_owner
  before update of owner_id on public.rooms
  for each row execute function public.unshare_on_new_owner();


-- 3. What a link shows -------------------------------------------------------------
-- Security definer, so it can read the room for a signed-out visitor; the
-- where clause is the whole rule. No row back means "not listed any more",
-- whether the room is paused, expired, deleted, unshared or never existed.
create or replace function public.get_shared_room(p_id bigint)
returns table (
  id                 bigint,
  title              text,
  rent               integer,
  location           text,
  description        text,
  photos             text[],
  cleanliness        smallint,
  social_level       smallint,
  sleep_schedule     text,
  pets_allowed       boolean,
  smoking_allowed    boolean,
  posted_at          timestamptz,
  source             text,
  claimed_at         timestamptz,
  owner_first_name   text,
  owner_avatar_url   text,
  owner_avatar_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.title, r.rent, r.location, r.description, r.photos,
         r.cleanliness, r.social_level, r.sleep_schedule,
         r.pets_allowed, r.smoking_allowed, r.posted_at,
         r.source, r.claimed_at,
         p.first_name, p.avatar_url, p.avatar_color
    from public.rooms r
    left join public.profiles p on p.id = r.owner_id
   where r.id = p_id
     and r.shared
     and r.active
     and (r.expires_at is null or r.expires_at > now())
     and not (r.source = 'craigslist' and r.claimed_at is null);
$$;

revoke execute on function public.get_shared_room(bigint) from public;
grant execute on function public.get_shared_room(bigint) to anon, authenticated;
