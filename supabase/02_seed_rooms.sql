-- roomfit — seed rooms
-- Run AFTER 01_schema.sql. Safe to run once; re-running duplicates rows.
-- These 12 rooms have owner_id = null, so the app never looks empty even
-- before a single user adds a listing.

insert into rooms
  (title, rent, location, cleanliness, social_level, sleep_schedule, pets_allowed, smoking_allowed, owner_id)
values
  ('Sunny room in a Mission flat', 1200, 'Mission', 4, 4, 'late', false, false, null),
  ('Modern SoMa loft, private room', 1500, 'SoMa', 5, 3, 'flexible', false, false, null),
  ('Quiet Sunset room, pet friendly', 900, 'Sunset', 3, 2, 'early', true, false, null),
  ('Social house share in Oakland', 800, 'Oakland', 4, 5, 'late', true, false, null),
  ('Cheap Berkeley room near campus', 750, 'Berkeley', 2, 3, 'flexible', false, true, null),
  ('Upscale Nob Hill room, very tidy', 1600, 'Nob Hill', 5, 2, 'early', false, false, null),
  ('Richmond District room, pets ok', 1000, 'Richmond District', 3, 4, 'flexible', true, false, null),
  ('Lively Hayes Valley share', 1400, 'Hayes Valley', 4, 5, 'late', false, false, null),
  ('Budget Daly City room, early risers', 700, 'Daly City', 3, 1, 'early', false, false, null),
  ('Spotless Fremont room, pet friendly', 850, 'Fremont', 5, 3, 'flexible', true, false, null),
  ('Party-friendly Mission room', 1100, 'Mission', 2, 5, 'late', false, true, null),
  ('Calm Sunset room, early birds', 950, 'Sunset', 4, 2, 'early', false, false, null);
