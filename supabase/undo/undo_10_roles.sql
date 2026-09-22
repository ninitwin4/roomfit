-- roomfit — undo 10_roles.sql
-- Run AFTER undo_11_claims.sql (11 depends on is_admin), and only once the
-- website no longer reads profiles.role. Admin assignments are lost.
begin;

drop trigger if exists protect_profile_role on public.profiles;
drop function if exists public.protect_profile_role();
drop function if exists public.is_admin();
alter table public.profiles drop column if exists role;

commit;
