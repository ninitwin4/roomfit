-- roomfit — claimable listings: active/paused rooms, original post links, and
-- one-time claim links an admin sends to the person whose room it is.
-- Run AFTER 10_roles.sql, in the Supabase SQL editor.
-- Additive: the live site keeps working, and every existing room stays visible.
-- Undo: undo/undo_11_claims.sql
--
-- The flow: an admin copies a room from another site (with the owner's
-- permission) as an inactive listing, creates a claim link, and sends it. The
-- owner opens it, signs up or signs in, can edit everything, and on Accept
-- becomes the owner and the listing goes live. All of that happens in the
-- functions at the bottom — nobody can claim a room by writing to tables.

-- 1. rooms.active ------------------------------------------------------------
-- The default fills every existing room with true as the column is added, so
-- nothing disappears and no backfill is needed.
alter table public.rooms
  add column if not exists active boolean not null default true;

-- 2. Who can read a room -------------------------------------------------------
-- Replaces "signed-in users can read all rooms". Policies combine with OR, so
-- the old one has to go or the new one would do nothing. Both statements run
-- in one transaction, so rooms are never unreadable in between.
--
-- This decides who MAY read a room. What each screen SHOWS is narrower: the
-- Find tab asks for active rooms only (admins can tick "Include inactive"),
-- and the Listings tab asks for your own rooms, paused ones included.
drop policy if exists "signed-in users can read all rooms" on public.rooms;
drop policy if exists "read active rooms, your own, or any as admin" on public.rooms;
create policy "read active rooms, your own, or any as admin"
  on public.rooms for select
  to authenticated
  using (active or owner_id = (select auth.uid()) or (select public.is_admin()));

-- 3. New rooms from non-admins always start live ------------------------------
-- The form hides the Active switch from non-admins; this makes it a rule rather
-- than a UI detail. Updates aren't touched: owners may pause and un-pause their
-- own rooms, which the existing update policy already scopes to the owner.
create or replace function public.enforce_room_active()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.active := true;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_room_active on public.rooms;
create trigger enforce_room_active
  before insert on public.rooms
  for each row execute function public.enforce_room_active();

-- 4. Where a listing came from (admins only) -----------------------------------
-- A separate table, not a column on rooms: rooms are readable by every signed-in
-- user and RLS can't hide one column, so a rooms.source_url would leak the
-- original post to anyone who asked the API for it.
create table if not exists public.room_sources (
  room_id    bigint primary key references public.rooms(id) on delete cascade,
  source_url text not null check (source_url ~* '^https?://'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.room_sources enable row level security;

create policy "admins read room sources"
  on public.room_sources for select to authenticated
  using ((select public.is_admin()));

create policy "admins add room sources"
  on public.room_sources for insert to authenticated
  with check ((select public.is_admin()));

create policy "admins change room sources"
  on public.room_sources for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "admins remove room sources"
  on public.room_sources for delete to authenticated
  using ((select public.is_admin()));

-- 5. Claim links -----------------------------------------------------------------
-- The token is a random v4 uuid (122 random bits), used once, expiring after 14
-- days. Admins can read this table (to show and copy a link); nobody can write
-- it directly — links are created and used only through the functions below.
-- Claimers never read it: they hand their one token to get_claim / claim_room.
create table if not exists public.claim_links (
  token      uuid primary key default gen_random_uuid(),
  room_id    bigint not null references public.rooms(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at    timestamptz,
  used_by    uuid references auth.users(id) on delete set null
);

create index if not exists claim_links_room_idx on public.claim_links (room_id);

alter table public.claim_links enable row level security;

create policy "admins read claim links"
  on public.claim_links for select to authenticated
  using ((select public.is_admin()));

-- 6. Functions -------------------------------------------------------------------
-- security definer so they can do what the caller can't do directly (read an
-- inactive room, change its owner). Each one checks exactly who may do what,
-- and search_path is pinned so nothing can be swapped in underneath them.

-- An admin makes a link for one of their own rooms. A new link replaces the
-- old one: any still-live link for the room is expired first, so there is only
-- ever one that works.
create or replace function public.create_claim_link(p_room_id bigint)
returns public.claim_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.claim_links;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can create claim links.';
  end if;
  if not exists (
    select 1 from public.rooms where id = p_room_id and owner_id = auth.uid()
  ) then
    raise exception 'You can only create links for your own listings.';
  end if;

  update public.claim_links
     set expires_at = now()
   where room_id = p_room_id and used_at is null and expires_at > now();

  insert into public.claim_links (room_id, created_by)
  values (p_room_id, auth.uid())
  returning * into link;

  return link;
end;
$$;

-- What the claim screen shows. Returns a status, plus the room when the link is
-- good. Never returns the original post link.
create or replace function public.get_claim(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token uuid;
  link    public.claim_links;
  r       public.rooms;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'signed_out');
  end if;

  begin
    v_token := p_token::uuid;
  exception when others then
    return jsonb_build_object('status', 'invalid');
  end;

  select * into link from public.claim_links where token = v_token;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if link.used_at is not null then
    return jsonb_build_object(
      'status', case when link.used_by = auth.uid() then 'claimed_by_you' else 'used' end
    );
  end if;
  if link.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  select * into r from public.rooms where id = link.room_id;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if r.owner_id = auth.uid() then
    return jsonb_build_object('status', 'own');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'room', jsonb_build_object(
      'id', r.id,
      'title', r.title,
      'rent', r.rent,
      'location', r.location,
      'cleanliness', r.cleanliness,
      'social_level', r.social_level,
      'sleep_schedule', r.sleep_schedule,
      'pets_allowed', r.pets_allowed,
      'smoking_allowed', r.smoking_allowed,
      'photos', coalesce(to_jsonb(r.photos), '[]'::jsonb),
      'photo_url', r.photo_url
    )
  );
end;
$$;

-- Accept: the claimer's edits, the ownership change, going live and using up
-- the link happen together or not at all. The link row is locked first, so two
-- people opening the same link can't both claim the room.
create or replace function public.claim_room(p_token text, p_room jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_token  uuid;
  link     public.claim_links;
  v_owner  uuid;
  v_photos text[];
begin
  if v_uid is null then
    raise exception 'You need to be signed in.';
  end if;

  begin
    v_token := p_token::uuid;
  exception when others then
    raise exception 'This link isn''t valid.';
  end;

  select * into link from public.claim_links where token = v_token for update;
  if not found then
    raise exception 'This link isn''t valid.';
  end if;
  if link.used_at is not null then
    raise exception 'This link has already been used.';
  end if;
  if link.expires_at <= now() then
    raise exception 'This link has expired. Ask us for a new one.';
  end if;

  select owner_id into v_owner from public.rooms where id = link.room_id for update;
  if not found then
    raise exception 'That room no longer exists.';
  end if;
  if v_owner = v_uid then
    raise exception 'This listing is already yours.';
  end if;

  if coalesce(trim(p_room->>'title'), '') = ''
     or coalesce(trim(p_room->>'location'), '') = '' then
    raise exception 'The listing needs a title and a location.';
  end if;

  v_photos := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_room->'photos', '[]'::jsonb))),
    '{}'
  );
  if cardinality(v_photos) > 5 then
    raise exception 'A listing can have at most 5 photos.';
  end if;

  update public.rooms set
    title           = trim(p_room->>'title'),
    rent            = (p_room->>'rent')::int,
    location        = trim(p_room->>'location'),
    cleanliness     = (p_room->>'cleanliness')::smallint,
    social_level    = (p_room->>'social_level')::smallint,
    sleep_schedule  = p_room->>'sleep_schedule',
    pets_allowed    = coalesce((p_room->>'pets_allowed')::boolean, false),
    smoking_allowed = coalesce((p_room->>'smoking_allowed')::boolean, false),
    photos          = v_photos,
    photo_url       = v_photos[1],
    owner_id        = v_uid,
    active          = true
  where id = link.room_id;

  update public.claim_links
     set used_at = now(), used_by = v_uid
   where token = v_token;

  -- belt and braces: no other link for this room keeps working
  update public.claim_links
     set expires_at = now()
   where room_id = link.room_id and used_at is null and expires_at > now();

  return link.room_id;
end;
$$;

revoke execute on function public.enforce_room_active() from public, anon;
revoke execute on function public.create_claim_link(bigint) from public, anon;
revoke execute on function public.get_claim(text) from public, anon;
revoke execute on function public.claim_room(text, jsonb) from public, anon;
grant execute on function public.create_claim_link(bigint) to authenticated;
grant execute on function public.get_claim(text) to authenticated;
grant execute on function public.claim_room(text, jsonb) to authenticated;
