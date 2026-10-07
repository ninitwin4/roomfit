-- roomfit — the team's "is interested" alert carries the room's claim link.
-- Run AFTER 19_imports_go_live.sql, in the Supabase SQL editor.
-- Undo: undo/undo_20_team_alert_claim_link.sql
--
-- Since 19, a Craigslist room can be live before its reply address is known, so
-- the host can't always be emailed. The alert now includes the room's working
-- claim link either way, so the team can send it to the host by hand:
--   * host emailed now    → the same link that email carries;
--   * host emailed before → the link from that email, while it still works;
--   * no reply address    → a new 14-day link, made for the team to send.
-- And the host email reuses a working claim link (with a week or more left)
-- instead of replacing it, so a link the team sent by hand keeps working. The
-- email now says the date the link works until.


-- 1. The host email reuses a working link ---------------------------------------------
-- Same as 19_imports_go_live.sql apart from the link and its date.
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
  v_until timestamptz;
  v_until_txt text;
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

  -- Reuse the room's working link (the team may already have sent it by hand)
  -- if it has a week or more left; otherwise make a fresh 14-day one.
  select token, expires_at into v_token, v_until from public.claim_links
   where room_id = r.id and used_at is null and expires_at > now() + interval '7 days'
   order by created_at desc
   limit 1;
  if v_token is null then
    insert into public.claim_links (room_id, created_by)
    values (r.id, r.owner_id)
    returning token, expires_at into v_token, v_until;
  end if;
  v_until_txt := to_char(v_until at time zone 'America/Los_Angeles', 'FMMonth FMDD');

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
      'The link works until %6$s.\n\n'
      'The RoomFit team\n\n'
      '--\nYou''re getting this because someone asked about your Craigslist post. '
      'It''s the only email we''ll send about it.',
      v_name, r.title, v_where, v_note, v_claim, v_until_txt
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
      format('The link works until %s. You''re getting this because someone asked '
             'about your Craigslist post. It''s the only email we''ll send about it.', v_until_txt)
    )
  );
  return true;
end;
$$;

revoke execute on function public.queue_host_email(bigint) from public, anon, authenticated;


-- 2. The team alert carries the claim link ----------------------------------------------
-- Same as 16_email_sending.sql apart from the claim link lines.

create or replace function public.team_alert_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        public.rooms;
  v_who    text;
  v_email  text;
  v_url    text;
  v_names  text;
  v_count  int;
  v_host   public.email_outbox;
  v_link   public.claim_links;
  v_hostline text;
  v_linkline text;
begin
  select * into r from public.rooms where id = new.room_id;
  if not found then
    return null;
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Someone'), u.email
    into v_who, v_email
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = new.user_id;

  select source_url into v_url from public.room_sources where room_id = r.id;

  select count(*), string_agg(coalesce(nullif(btrim(p.first_name), ''), 'someone'), ', ' order by ri.created_at)
    into v_count, v_names
    from public.room_interests ri left join public.profiles p on p.id = ri.user_id
   where ri.room_id = r.id;

  select * into v_host from public.email_outbox
   where room_id = r.id and kind = 'host_interest';

  -- The room's working claim link, or a new one if it has none.
  select * into v_link from public.claim_links
   where room_id = r.id and used_at is null and expires_at > now()
   order by created_at desc
   limit 1;
  if v_link.token is null and r.claimed_at is null then
    insert into public.claim_links (room_id, created_by)
    values (r.id, r.owner_id)
    returning * into v_link;
  end if;

  v_hostline := case
    when v_host.id is null then
      'not sent: no reply address on file. Send them the claim link below yourself.'
    when v_host.user_id = new.user_id then
      'sent now, with the claim link below.'
    else
      format('already sent on %s, when the first person was interested. Not sent again.',
             to_char(v_host.created_at at time zone 'America/Los_Angeles', 'Mon FMDD'))
  end;

  v_linkline := case
    when v_link.token is null then 'none (the room has been claimed)'
    else format('%s/?claim=%s (works until %s)',
                public.app_url(), v_link.token,
                to_char(v_link.expires_at at time zone 'America/Los_Angeles', 'Mon FMDD'))
  end;

  perform public.queue_team_email(
    'team_interest', r.id, new.user_id,
    format('[RoomFit] %s is interested in "%s"', v_who, r.title),
    format(
      E'%1$s (%2$s) tapped "I''m interested".\n\n'
      'Room:   %3$s\n'
      '        $%4$s/mo · %5$s · room #%6$s\n'
      'Post:   %7$s\n'
      'Note:   "%8$s"\n\n'
      'Interested so far: %9$s (%10$s)\n'
      'Host email: %11$s\n'
      'Claim link: %12$s\n\n'
      '%13$s',
      v_who, coalesce(v_email, 'no email'),
      r.title, to_char(r.rent, 'FM999,999'), r.location, r.id,
      coalesce(v_url, 'none on file'),
      coalesce(new.note, 'Hi! Is the room still available?'),
      v_count, v_names, v_hostline, v_linkline,
      public.app_url()
    )
  );
  return null;
end;
$$;

revoke execute on function public.team_alert_interest() from public, anon, authenticated;
