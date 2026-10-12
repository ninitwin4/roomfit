-- roomfit — undo 25_shared_rooms.sql
-- One transaction: all of it happens, or none of it.
-- Run only AFTER the app no longer reads rooms.shared, or every room load
-- fails (see "Database before app" in CLAUDE.md). Every /r/<id> link stops
-- working, and which rooms their owners had shared is lost.
begin;

drop function if exists public.get_shared_room(bigint);

drop trigger if exists unshare_on_new_owner on public.rooms;
drop function if exists public.unshare_on_new_owner();

alter table public.rooms drop column if exists shared;

commit;
