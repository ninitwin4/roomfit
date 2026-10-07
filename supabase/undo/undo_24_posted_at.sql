-- roomfit — undo 24_posted_at.sql
-- One transaction: all of it happens, or none of it.
-- Run only AFTER the app no longer reads rooms.posted_at, or every room load
-- fails (see "Database before app" in CLAUDE.md). Imported rooms keep their
-- post date in room_sources; the dates of rooms added in the app are still
-- rooms.created_at.
begin;

drop trigger if exists copy_source_posted_at on public.room_sources;
drop function if exists public.copy_source_posted_at();

drop trigger if exists protect_room_posted_at on public.rooms;
drop function if exists public.protect_room_posted_at();

alter table public.rooms drop column if exists posted_at;

commit;
