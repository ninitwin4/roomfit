-- roomfit — profile avatars
-- Run AFTER 06_profiles.sql, in the Supabase SQL editor.
-- Additive and guarded: safe to run on the live database.

-- Which palette colour backs the initials when there's no photo.
-- Null means "not chosen yet" — the app falls back to a colour derived from
-- the user id, so nobody ever renders as a grey blob.
alter table profiles add column if not exists avatar_color text;

-- avatar_url already exists from 06_profiles.sql.

-- Small, public, JPEG-only. Avatars are downscaled to 256px in the browser
-- and land around 15 KB, so 1 MB is a generous server-side backstop.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- Same shape as the room-photos policies: paths are {auth.uid()}/{uuid}.jpg,
-- so the check is a simple non-recursive string compare and a user can only
-- ever write inside their own folder.

create policy "avatars are readable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- If the SQL editor rejects the policies with "must be owner of table objects",
-- create them in Dashboard → Storage → Policies on the avatars bucket instead,
-- using these exact USING / WITH CHECK expressions.
