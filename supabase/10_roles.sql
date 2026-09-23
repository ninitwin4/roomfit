-- roomfit — roles: who is an admin, and a guard so nobody can promote themselves
-- Run AFTER 09_hidden_threads.sql, in the Supabase SQL editor.
-- Additive and guarded: safe to run on the live database. Undo: undo/undo_10_roles.sql
--
-- Admins are set by hand in the dashboard: Table Editor → profiles → role → admin.
-- There is no way to become one from the app, and that's the point.

-- 1. The column. The default fills every existing profile as the column is
--    added, so no separate backfill is needed.
alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

-- 2. The guard. RLS is row-level, not column-level: the "users update their own
--    profile" policy lets a user write every column of their row, role included.
--    Column grants could narrow that, but they're fragile (see 08_messages.sql),
--    so a trigger does it instead.
--
--    Requests from the app run as the 'authenticated' (or 'anon') database role.
--    The dashboard and SQL editor don't, so changes made there pass untouched.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.role := 'user';                       -- signing up can never create an admin
    elsif new.role is distinct from old.role then
      raise exception 'Only an administrator can change a role.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();

-- 3. The check every admin-only rule uses. security definer + an empty
--    search_path so it reads profiles the same way whoever calls it; it only
--    ever answers about the caller, so it can't be used to probe other users.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
