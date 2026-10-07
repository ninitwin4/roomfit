-- roomfit — undo 20_team_alert_claim_link.sql
-- One transaction: all of it happens, or none of it.
-- The team alert loses its claim link line, and the host email goes back to
-- always making a fresh 14-day link. Claim links already made stay as they are.
begin;

-- queue_host_email as in 19_imports_go_live.sql
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

-- team_alert_interest as in 16_email_sending.sql
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
  v_expiry timestamptz;
  v_hostline text;
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
  select max(expires_at) into v_expiry from public.claim_links
   where room_id = r.id and used_at is null;

  v_hostline := case
    when v_host.id is null then
      'not sent: no reply address on file.'
    when v_host.user_id = new.user_id then
      format('sent now, with a claim link that works until %s.',
             to_char(v_expiry at time zone 'America/Los_Angeles', 'Mon FMDD'))
    else
      format('already sent on %s, when the first person was interested. Not sent again.',
             to_char(v_host.created_at at time zone 'America/Los_Angeles', 'Mon FMDD'))
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
      'Host email: %11$s\n\n'
      '%12$s',
      v_who, coalesce(v_email, 'no email'),
      r.title, to_char(r.rent, 'FM999,999'), r.location, r.id,
      coalesce(v_url, 'none on file'),
      coalesce(new.note, 'Hi! Is the room still available?'),
      v_count, v_names, v_hostline,
      public.app_url()
    )
  );
  return null;
end;
$$;

revoke execute on function public.queue_host_email(bigint) from public, anon, authenticated;
revoke execute on function public.team_alert_interest() from public, anon, authenticated;

commit;
