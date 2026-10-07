-- roomfit — email the team inbox when someone messages the team account.
-- Run AFTER 21_keep_ranking_awake.sql, in the Supabase SQL editor.
-- Undo: undo/undo_22_team_message_alert.sql
--
-- The team adds listings by hand from public Facebook posts, signed in as the
-- team account, so messages about them land in that account's in-app inbox.
-- This makes sure each one is seen: a new message to an account whose login
-- email is on the team list (team_recipients) queues one email to that
-- address, through the same outbox, mailer and retries as the other team
-- alerts (16_email_sending.sql). Real owners aren't emailed by this.
--
-- The email has the sender's first name, the listing, the first ~100
-- characters and a link to the inbox. Never the sender's email address, and
-- never the rest of the conversation.
--
-- Bursts: one email per sender per listing per quiet spell. A message is
-- skipped if the same person sent another about the same listing in the 10
-- minutes before it, so three quick messages make one email.


-- 1. The outbox accepts the new kind (the list as 17_listing_expiry.sql left it) --
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('host_interest', 'host_online', 'team_interest', 'team_claim',
                  'listing_expired', 'team_message'));


-- 2. The alert -------------------------------------------------------------------------
create or replace function public.team_alert_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.rooms;
  v_to    text;
  v_from  text;
  v_text  text;
begin
  -- Only messages to an account on the team list; the email goes to that address.
  select u.email into v_to
    from auth.users u
   where u.id = new.recipient_id
     and exists (select 1 from public.team_recipients t
                  where lower(t.email) = lower(u.email));
  if v_to is null then
    return null;
  end if;

  -- One per burst: skip if this person wrote about this listing in the last 10 minutes.
  if exists (select 1 from public.messages m
              where m.room_id = new.room_id
                and m.sender_id = new.sender_id
                and m.recipient_id = new.recipient_id
                and m.id <> new.id
                and m.created_at > new.created_at - interval '10 minutes'
                and m.created_at <= new.created_at) then
    return null;
  end if;

  select * into r from public.rooms where id = new.room_id;
  if not found then
    return null;
  end if;

  select coalesce(nullif(btrim(first_name), ''), 'Someone') into v_from
    from public.profiles where id = new.sender_id;
  v_from := coalesce(v_from, 'Someone');

  -- The preview: one line, at most 100 characters.
  v_text := regexp_replace(btrim(new.body), '[[:space:]]+', ' ', 'g');
  if char_length(v_text) > 100 then
    v_text := rtrim(left(v_text, 99)) || '…';
  end if;

  insert into public.email_outbox
    (kind, room_id, user_id, to_email, subject, text_body, html_body)
  values (
    'team_message', r.id, new.sender_id, v_to,
    format('[RoomFit] New message about "%s"', r.title),
    format(
      E'%1$s sent a message about "%2$s"\n'
      '($%3$s/mo · %4$s · room #%5$s):\n\n'
      '  "%6$s"\n\n'
      'Reply in the inbox: %7$s/?view=messages',
      v_from, r.title, to_char(r.rent, 'FM999,999'), r.location, r.id,
      v_text, public.app_url()
    ),
    ''
  );
  return null;

-- An email problem must never stop a message being sent: skip the alert instead.
exception when others then
  raise warning 'team_alert_message skipped for message %: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke execute on function public.team_alert_message() from public, anon, authenticated;

drop trigger if exists team_alert_message on public.messages;
create trigger team_alert_message
  after insert on public.messages
  for each row execute function public.team_alert_message();
