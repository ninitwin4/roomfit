-- roomfit — multiple room photos (up to 5, first one is the cover)
-- Run AFTER 03_photos.sql, in the Supabase SQL editor.
-- Additive and idempotent: safe to run on the live database.

-- The set of photos for a room. photos[1] is the cover.
-- An array column rather than a join table: at most 5 short URLs per room, and
-- ordering *is* the data (cover = first), which an array gives us for free.
alter table rooms add column if not exists photos text[] not null default '{}';

-- Carry the existing single cover photo across. Guarded on photos = '{}' so
-- re-running this can never duplicate an entry.
update rooms
   set photos = array[photo_url]
 where photo_url is not null
   and photos = '{}';

-- NOTE: photo_url is deliberately left in place.
-- Dropping it here would break the currently-deployed frontend, which still
-- selects it, in the window between running this and Vercel finishing the next
-- deploy. The app keeps photo_url in sync with photos[1] from now on, so it
-- stays a valid fallback. Drop it in a later migration once you're confident:
--
--   alter table rooms drop column photo_url;
