-- roomfit — count active users: one row per person per day they open the app.
-- Run AFTER 25_shared_rooms.sql, in the Supabase SQL editor.
-- Undo: undo/undo_26_user_activity.sql
--
-- auth.users.last_sign_in_at only moves when someone types their password, and
-- the app keeps people signed in, so a regular who never signs out looks
-- inactive. Instead the app calls record_visit() whenever it's opened, and
-- that day is stored once. It records the account and the date (Pacific) and
-- nothing else: no pages, clicks, devices or locations.
--
-- Nobody can read or write the table through the app or the API: it has row
-- level security and no policies, and record_visit() only ever adds today for
-- the caller. The team reads it in the SQL editor: the two queries at the end
-- of this file, saved there as "Active users" and "Weekly users".
--
-- Safe to run before or after the app change: until the app calls
-- record_visit(), the table just doesn't grow.


-- 1. The table ---------------------------------------------------------------------
create table if not exists public.user_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);

alter table public.user_activity enable row level security;
revoke all on public.user_activity from anon, authenticated;


-- 2. The app's one call ------------------------------------------------------------
-- Idempotent: opening the app ten times in a day is still one row.
create or replace function public.record_visit()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.user_activity (user_id, day)
  select auth.uid(), (now() at time zone 'America/Los_Angeles')::date
   where auth.uid() is not null
  on conflict do nothing;
$$;

revoke execute on function public.record_visit() from public, anon;
grant execute on function public.record_visit() to authenticated;


-- 3. What we already know ----------------------------------------------------------
-- Each account's sign-up day and last sign-in day are real visits, so the
-- history starts with those rather than empty.
insert into public.user_activity (user_id, day)
select id, (created_at at time zone 'America/Los_Angeles')::date from auth.users
union
select id, (last_sign_in_at at time zone 'America/Los_Angeles')::date
  from auth.users where last_sign_in_at is not null
on conflict do nothing;


-- 4. Reading it (SQL editor; not part of the migration) -----------------------------
-- -- Active users right now (team admins left out)
-- with a as (
--   select ua.* from public.user_activity ua
--   left join public.profiles p on p.id = ua.user_id
--   where coalesce(p.role, 'user') <> 'admin'
-- ), today as (select (now() at time zone 'America/Los_Angeles')::date d)
-- select
--   count(distinct user_id) filter (where day = (select d from today))                       as active_today,
--   count(distinct user_id) filter (where day > (select d from today) - 7)                   as active_last_7_days,
--   count(distinct user_id) filter (where day > (select d from today) - 30)                  as active_last_30_days
-- from a;
--
-- -- Week by week: new sign-ups, active people, and how many of them came back
-- with a as (
--   select ua.user_id, ua.day from public.user_activity ua
--   left join public.profiles p on p.id = ua.user_id
--   where coalesce(p.role, 'user') <> 'admin'
-- ), first as (select user_id, min(day) as joined from a group by 1)
-- select date_trunc('week', a.day)::date                                 as week_starting,
--        count(distinct a.user_id)                                       as active,
--        count(distinct a.user_id) filter (where date_trunc('week', f.joined) = date_trunc('week', a.day)) as new,
--        count(distinct a.user_id) filter (where date_trunc('week', f.joined) < date_trunc('week', a.day)) as returning
--   from a join first f using (user_id)
--  group by 1 order by 1 desc limit 12;
