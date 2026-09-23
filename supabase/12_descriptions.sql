-- roomfit — an optional free-text description on each room
-- Run AFTER 11_claims.sql, in the Supabase SQL editor.
-- Additive: existing rooms simply have no description, and the live site
-- ignores the column. Undo: undo/undo_12_descriptions.sql
--
-- Display-only, like photos: it never reaches the ranking service (api.js only
-- sends the scored fields), so scoring is untouched.

-- 1. The column. No default: empty means "no description" and the card shows no
--    Description button. 2,000 characters fits a long listing post (a typical
--    one runs ~1,200) while stopping anyone pasting a novel.
alter table public.rooms
  add column if not exists description text
  check (description is null or char_length(description) <= 2000);

-- 2. The claim flow carries it too, or a description copied from another site
--    would be lost on claim. Same functions as 11_claims.sql, plus description.

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
      'description', r.description,
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

-- If a request carries no description key at all (a tab still running the old
-- site), the existing description is kept rather than wiped. A blank one
-- clears it.
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
    description     = case
                        when p_room ? 'description'
                          then nullif(trim(p_room->>'description'), '')
                        else description
                      end,
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

-- create or replace keeps existing grants, but restate them so this file is
-- correct on its own.
revoke execute on function public.get_claim(text) from public, anon;
revoke execute on function public.claim_room(text, jsonb) from public, anon;
grant execute on function public.get_claim(text) to authenticated;
grant execute on function public.claim_room(text, jsonb) to authenticated;
