-- roomfit — undo 26_user_activity.sql
-- One transaction: all of it happens, or none of it.
-- Deletes the visit history for good. The app's record_visit() call then fails
-- quietly (it's never allowed to get in the way), so the app keeps working.
begin;

drop function if exists public.record_visit();
drop table if exists public.user_activity;

commit;
