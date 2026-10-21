-- roomfit — read receipts on the server, and an email for a new message.
-- Run AFTER 26_user_activity.sql, in the Supabase SQL editor.
-- Undo: undo/undo_27_message_emails.sql
--
-- 1. Reads. messages.read_at was reserved in 08_messages.sql and never set:
--    unread lives in localStorage (frontend/src/unread.js), so nobody else —
--    the team included — could tell whether a host had seen a message.
--    mark_thread_read() fills it in. Messages stay immutable: there is still
--    no UPDATE policy (a recipient-scoped one would let them rewrite `body`),
--    and this function only ever stamps read_at, only on messages sent *to*
--    the caller, only once. The app keeps localStorage for its unread dots.
--
-- 2. Emails. Nobody was told about a new message unless they opened the app.
--    A new message now queues one email to its recipient, through the same
--    outbox, mailer and retries as every other email (16_email_sending.sql):
--    the sender's first name, the listing, the first ~100 characters and a
--    link to the inbox. Never the sender's email address.
--
--    At most one per conversation every 6 hours, so a back-and-forth makes
--    one email, not one per line. Skipped: messages to the team account (the
--    team alert in 22_team_message_alert.sql covers those), and the notes a
--    claim turns into messages for the new owner, who is on the claim screen
--    at that moment.


-- 1. The outbox accepts the new kind (the list as 22_team_message_alert.sql left it) --
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('host_interest', 'host_online', 'team_interest', 'team_claim',
                  'listing_expired', 'team_message', 'new_message'));


-- 2. mark_thread_read ----------------------------------------------------------------
-- Stamps every unread message in one thread that was sent to the caller.
-- Returns how many it stamped.
create or replace function public.mark_thread_read(p_room_id bigint, p_other_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  update public.messages
     set read_at = now()
   where room_id = p_room_id
     and sender_id = p_other_id
     and recipient_id = auth.uid()
     and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_thread_read(bigint, uuid) from public, anon;
grant execute on function public.mark_thread_read(bigint, uuid) to authenticated;


-- 3. The email --------------------------------------------------------------------------
create or replace function public.email_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.rooms;
  v_to    text;
  v_name  text;
  v_from  text;
  v_text  text;
  v_link  text := public.app_url() || '/?view=messages';
begin
  select u.email, coalesce(nullif(btrim(p.first_name), ''), 'there')
    into v_to, v_name
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = new.recipient_id;
  if v_to is null then
    return null;
  end if;

  -- The team account has its own alert.
  if exists (select 1 from public.team_recipients t where lower(t.email) = lower(v_to)) then
    return null;
  end if;

  select * into r from public.rooms where id = new.room_id;
  if not found then
    return null;
  end if;

  -- A claim turns each interested person's note into a message to the new
  -- owner in the same moment; they're looking at it already.
  if new.recipient_id = r.owner_id and r.claimed_at is not null
     and new.created_at <= r.claimed_at + interval '1 minute' then
    return null;
  end if;

  -- One per conversation every 6 hours.
  if exists (select 1 from public.email_outbox o
              where o.kind = 'new_message'
                and o.room_id = new.room_id
                and o.user_id = new.sender_id
                and lower(o.to_email) = lower(v_to)
                and o.created_at > now() - interval '6 hours') then
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
    'new_message', r.id, new.sender_id, v_to,
    format('%s sent you a message on RoomFit', v_from),
    format(
      E'Hi %1$s,\n\n'
      '%2$s sent you a message about "%3$s":\n\n'
      '  "%4$s"\n\n'
      'Reply in your inbox:\n%5$s\n\n'
      'The RoomFit team',
      v_name, v_from, r.title, v_text, v_link
    ),
    public.email_html(
      format('%s sent you a message', v_from),
      array[
        format('Hi %s,', v_name),
        format('%s sent you a message about "%s":', v_from, r.title),
        format('"%s"', v_text)
      ],
      'Reply in your inbox',
      v_link,
      'You''re getting this because someone messaged you on RoomFit. '
      'We send at most one email per conversation every 6 hours.'
    )
  );
  return null;

-- An email problem must never stop a message being sent: skip the email instead.
exception when others then
  raise warning 'email_new_message skipped for message %: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke execute on function public.email_new_message() from public, anon, authenticated;

drop trigger if exists email_new_message on public.messages;
create trigger email_new_message
  after insert on public.messages
  for each row execute function public.email_new_message();
