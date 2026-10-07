-- roomfit — Craigslist imports go live straight away, with or without a reply
-- address, and the host is emailed as soon as one is known.
-- Run AFTER 18_import_cleanup_fixes.sql, in the Supabase SQL editor.
-- Undo: undo/undo_19_imports_go_live.sql
--
-- Before: an import stayed hidden until the email bot found its reply address.
-- Now:    an import is live the moment it's added, so people can say "I'm
--         interested" right away. The host email waits for the address:
--           * address already known  → the first "I'm interested" sends it
--                                      (as before);
--           * address not known yet  → interest is recorded, and the email
--                                      goes out when report_email() saves the
--                                      address, naming the first person who
--                                      was interested.
--         Still at most one host email per room.


-- 1. The host email, in one place -------------------------------------------------
-- Moved out of express_interest() (15_craigslist.sql) so report_email() can send
-- it too. Same text. Returns true if it queued one.
create or replace function public.queue_host_email(p_room_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.rooms;
  i       record;
  v_email text;
  v_token uuid;
  v_name  text;
  v_note  text;
  v_claim text;
  v_where text;
begin
  select * into r from public.rooms where id = p_room_id;
  if not found or r.source <> 'craigslist' or r.claimed_at is not null then
    return false;
  end if;
  if exists (select 1 from public.email_outbox
              where room_id = r.id and kind = 'host_interest') then
    return false; -- one host email per room, ever
  end if;

  select contact_email into v_email from public.room_sources where room_id = r.id;
  if v_email is null then
    return false; -- sent later, when report_email() saves the address
  end if;

  -- the first person who was interested
  select ri.user_id, ri.note into i
    from public.room_interests ri
   where ri.room_id = r.id
   order by ri.created_at
   limit 1;
  if not found then
    return false;
  end if;

  -- A fresh 14-day link; any older one for this room stops working.
  update public.claim_links
     set expires_at = now()
   where room_id = r.id and used_at is null and expires_at > now();
  insert into public.claim_links (room_id, created_by)
  values (r.id, r.owner_id)
  returning token into v_token;

  select coalesce(nullif(btrim(first_name), ''), 'Someone')
    into v_name
    from public.profiles where id = i.user_id;
  v_name  := coalesce(v_name, 'Someone');
  v_note  := coalesce(i.note, 'Hi! Is the room still available?');
  v_claim := public.app_url() || '/?claim=' || v_token;
  v_where := format('$%s/mo · %s', to_char(r.rent, 'FM999,999'), r.location);

  insert into public.email_outbox
    (kind, room_id, user_id, to_email, subject, text_body, html_body)
  values (
    'host_interest', r.id, i.user_id, v_email,
    r.title,
    format(
      E'Hi,\n\n'
      '%1$s found your room "%2$s" (%3$s) on RoomFit and wants to know more:\n\n'
      '  "%4$s"\n\n'
      'RoomFit is a new San Francisco app that matches people to rooms by how '
      'they''ll actually live together: budget, neighbourhood, tidiness, social '
      'life and sleep schedule. So the people who reach out have already been '
      'scored against your place.\n\n'
      'We''ve set up your listing from your Craigslist post. Claim it to read '
      '%1$s''s message and reply. It''s free and takes about a minute:\n\n'
      '%5$s\n\n'
      'The link works for 14 days.\n\n'
      'The RoomFit team\n\n'
      '--\nYou''re getting this because someone asked about your Craigslist post. '
      'It''s the only email we''ll send about it.',
      v_name, r.title, v_where, v_note, v_claim
    ),
    public.email_html(
      format('%s wants to rent your room', v_name),
      array[
        format('%s found "%s" (%s) on RoomFit and wants to know more:', v_name, r.title, v_where),
        format('"%s"', v_note),
        'RoomFit is a new San Francisco app that matches people to rooms by how '
        'they''ll actually live together: budget, neighbourhood, tidiness, social '
        'life and sleep schedule. So the people who reach out have already been '
        'scored against your place.',
        format('We''ve set up your listing from your Craigslist post. Claim it to '
               'read %s''s message and reply. It''s free and takes about a minute.', v_name)
      ],
      format('See %s''s message', v_name),
      v_claim,
      'The link works for 14 days. You''re getting this because someone asked '
      'about your Craigslist post. It''s the only email we''ll send about it.'
    )
  );
  return true;
end;
$$;

revoke execute on function public.queue_host_email(bigint) from public, anon, authenticated;


-- 2. express_interest: same checks, host email through the helper -----------------
create or replace function public.express_interest(p_room_id bigint, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  r      public.rooms;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'You need to be signed in.';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Keep your note under 500 characters.';
  end if;

  -- Locked first, so two people tapping at once queue up and only one host
  -- email is ever written.
  select * into r from public.rooms where id = p_room_id for update;
  if not found or not r.active or r.source <> 'craigslist' or r.claimed_at is not null then
    raise exception 'This room isn''t taking interest here. Try Message instead.';
  end if;
  if r.owner_id = v_uid then
    raise exception 'This is your own listing.';
  end if;

  insert into public.room_interests (room_id, user_id, note)
  values (r.id, v_uid, v_note)
  on conflict (room_id, user_id) do nothing;
  if not found then
    return 'already';
  end if;

  perform public.queue_host_email(r.id);
  return 'sent';
end;
$$;

revoke execute on function public.express_interest(bigint, text) from public, anon;
grant execute on function public.express_interest(bigint, text) to authenticated;


-- 3. import_listing: live straight away ----------------------------------------------
-- Same as 18_import_cleanup_fixes.sql apart from active = true.
create or replace function public.import_listing(p_room jsonb, p_source jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id     bigint;
  v_photos text[];
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import rooms.';
  end if;
  if p_source->>'source' is distinct from 'craigslist' then
    raise exception 'Only Craigslist imports are supported.';
  end if;
  if coalesce(p_source->>'external_id', '') = '' then
    raise exception 'An import needs the post key.';
  end if;
  if exists (select 1 from public.rejected_imports
              where external_id = p_source->>'external_id') then
    return null; -- turned down before; treated like a post already imported
  end if;

  v_photos := array(select jsonb_array_elements_text(coalesce(p_room->'photos', '[]'::jsonb)));
  if cardinality(v_photos) not between 1 and 5 then
    raise exception 'An imported room needs 1 to 5 photos.';
  end if;

  begin
    insert into public.rooms
      (title, rent, location, description, cleanliness, social_level,
       sleep_schedule, pets_allowed, smoking_allowed, photos, photo_url,
       owner_id, active, source)
    values (
      trim(p_room->>'title'),
      (p_room->>'rent')::int,
      trim(p_room->>'location'),
      nullif(trim(p_room->>'description'), ''),
      3, 3, 'flexible', -- placeholders: the host answers these when claiming
      coalesce((p_room->>'pets_allowed')::boolean, false),
      coalesce((p_room->>'smoking_allowed')::boolean, false),
      v_photos, v_photos[1],
      auth.uid(), true, 'craigslist'
    )
    returning id into v_id;

    insert into public.room_sources (room_id, source_url, external_id, posted_at, raw)
    values (v_id, p_source->>'source_url', p_source->>'external_id',
            (p_source->>'posted_at')::timestamptz, p_source->'raw');
  exception when unique_violation then
    return null; -- already imported; the room insert above is undone too
  end;

  return v_id;
end;
$$;

revoke execute on function public.import_listing(jsonb, jsonb) from public, anon;
grant execute on function public.import_listing(jsonb, jsonb) to authenticated;


-- 4. The bot works on live rooms too ---------------------------------------------------
-- email_queue() and report_email() no longer require the room to be hidden.
create or replace function public.email_queue(p_limit int default 50)
returns table (room_id bigint, title text, rent int, source_url text,
               external_id text, attempts smallint)
language sql
stable
set search_path = ''
as $$
  select r.id, r.title, r.rent, s.source_url, s.external_id, s.email_attempts
    from public.rooms r
    join public.room_sources s on s.room_id = r.id
   where r.source = 'craigslist'
     and r.claimed_at is null
     and s.contact_email is null
     and (s.email_status is null or s.email_status = 'error')
     and s.email_attempts < 3
   order by s.posted_at desc nulls last, r.id desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

create or replace function public.report_email(p_room_id bigint, p_status text, p_email text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not exists (
    select 1
      from public.rooms r
      join public.room_sources s on s.room_id = r.id
     where r.id = p_room_id
       and r.source = 'craigslist'
       and r.claimed_at is null
       and s.contact_email is null
       and (s.email_status is null or s.email_status = 'error')
       and s.email_attempts < 3
  ) then
    raise exception 'Room % isn''t waiting for an email.', p_room_id;
  end if;

  if p_status = 'found' then
    if v_email !~ '^[0-9a-f]{32}@hous\.craigslist\.org$' then
      raise exception 'That isn''t a Craigslist housing reply address: %', v_email;
    end if;
    update public.room_sources
       set contact_email = v_email, email_status = 'found',
           email_checked_at = now(), updated_at = now()
     where room_id = p_room_id;
    update public.rooms set active = true where id = p_room_id and not active;
    -- someone may already be waiting: send the host email now
    perform public.queue_host_email(p_room_id);
    return 'live';

  elsif p_status in ('gone', 'mismatch', 'no_email') then
    update public.room_sources
       set email_status = p_status, email_checked_at = now(), updated_at = now()
     where room_id = p_room_id;
    return 'removed from the queue';

  elsif p_status = 'error' then
    update public.room_sources
       set email_status = 'error', email_attempts = email_attempts + 1,
           email_checked_at = now(), updated_at = now()
     where room_id = p_room_id;
    return 'will retry';
  end if;

  raise exception 'Unknown status "%". Use found, gone, mismatch, no_email or error.', p_status;
end;
$$;

revoke execute on function public.email_queue(int) from public, anon, authenticated;
revoke execute on function public.report_email(bigint, text, text) from public, anon, authenticated;
grant execute on function public.email_queue(int) to service_role;
grant execute on function public.report_email(bigint, text, text) to service_role;
