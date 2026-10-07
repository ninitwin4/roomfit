-- roomfit — remove the 12 sample listings from 02_seed_rooms.sql.
-- Run AFTER 22_team_message_alert.sql, in the Supabase SQL editor.
-- Undo: undo/undo_23_remove_sample_listings.sql
--
-- They kept the app from looking empty before anyone had listed a room. Real
-- listings (Craigslist imports, team-added rooms, owners' own) do that now, so
-- the samples go. They're the rooms with no owner, ids 1-12; the id check means
-- nothing else is ever caught by it.
--
-- Deleting them also removes anything that points at them: people's saves
-- (3 when this was written) and nothing else. No messages, interests, claim
-- links or source links referred to them.
--
-- Their photo FILES are not touched by this: storage files are deleted in the
-- dashboard (Storage → room-photos), never with SQL, which would remove only
-- the record and leave the file. Keep P1.jpg, P3.jpg and P7.jpg: the landing
-- page's "how it works" demo shows them (landing/lib/content.js).
--
-- backend/seed_rooms.json stays: /rank falls back to it when called without
-- rooms (curl, local dev). It never reaches the database or the app.

delete from public.rooms
 where owner_id is null
   and id between 1 and 12;
