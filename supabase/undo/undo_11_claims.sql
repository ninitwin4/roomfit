-- roomfit — undo 11_claims.sql
-- One transaction: all of it happens, or none of it.
--
-- Run only AFTER the website no longer uses these (put the website back first).
--
-- Before running:
--   1. See which rooms are inactive — they become visible to EVERYONE once the
--      column is dropped (unclaimed prospect listings, paused rooms):
--        select id, title, owner_id from public.rooms where active = false;
--      Delete the ones that shouldn't go live.
--   2. Export room_sources (Table Editor → room_sources → Export to CSV). The
--      original post links are deleted permanently below.
--
-- Not reversed, on purpose — it's real data: claimed rooms keep their new owner
-- and edits, and photos copied into claimers' folders stay where they are.
begin;

-- 1. The functions
drop function if exists public.claim_room(text, jsonb);
drop function if exists public.get_claim(text);
drop function if exists public.create_claim_link(bigint);

-- 2. Admin-only tables
drop table if exists public.claim_links;
drop table if exists public.room_sources;

-- 3. The guard that keeps non-admin rooms live on creation
drop trigger if exists enforce_room_active on public.rooms;
drop function if exists public.enforce_room_active();

-- 4. The original read rule, back in the same transaction so rooms are never
--    unreadable in between
drop policy if exists "read active rooms, your own, or any as admin" on public.rooms;
create policy "signed-in users can read all rooms"
  on public.rooms for select
  to authenticated
  using (true);

-- 5. The column (every room becomes visible again)
alter table public.rooms drop column if exists active;

commit;
