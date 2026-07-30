-- roomfit — room cover photos (Phase 1)
-- Run this AFTER 01_schema.sql and 02_seed_rooms.sql, in the Supabase SQL editor.
-- Safe to run on the live database: every statement is additive and guarded.

-- 1. The column. Nullable with no default, so this is a metadata-only change:
--    instant, and the 12 seed rooms simply get NULL.
alter table rooms add column if not exists photo_url text;

-- 2. The bucket. Public, so a stored URL renders with a bare <img src> and no
--    signed-URL round trip. "Public" only affects reads — the policies below
--    still govern every write.
--    3 MB cap and JPEG-only are server-side backstops; the client already
--    downscales to ~200 KB JPEG before uploading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-photos', 'room-photos', true, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

-- 3. Storage policies.
--    Paths are {auth.uid()}/{uuid}.jpg — keyed by user, not by room, because at
--    add-time the room row doesn't exist yet and has no id. This keeps the check
--    a simple non-recursive string compare: you may only write inside your own
--    folder, so you can only ever burn your own quota.

create policy "room photos are readable"
  on storage.objects for select
  to public
  using (bucket_id = 'room-photos');

create policy "users upload their own room photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users replace their own room photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own room photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- If the SQL editor rejects the policies with "must be owner of table objects",
-- create them instead in Dashboard → Storage → Policies on the room-photos
-- bucket, using these exact USING / WITH CHECK expressions.
