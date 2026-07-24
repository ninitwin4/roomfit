import { createClient } from "@supabase/supabase-js";

// Both values are safe to expose: the anon key only grants what your Row Level
// Security policies allow. Never put the service_role key in frontend code.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

export async function fetchRooms() {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      "id, title, rent, location, cleanliness, social_level, sleep_schedule, pets_allowed, smoking_allowed, owner_id"
    );

  if (error) throw new Error(`Couldn't load rooms: ${error.message}`);
  return data ?? [];
}

// Distinct neighborhoods, for the preference dropdown. Postgres has no cheap
// DISTINCT through the JS client, so we dedupe the location column here. RLS
// lets signed-in users read every room, so this covers seed + user listings.
export async function fetchLocations() {
  const { data, error } = await supabase.from("rooms").select("location");
  if (error) throw new Error(`Couldn't load locations: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.location))].sort((a, b) =>
    a.localeCompare(b)
  );
}

// --- listings (Session B) ---------------------------------------------------
// All writes are guarded by RLS: users can only insert/update/delete rooms
// where owner_id = auth.uid(). The frontend still sets owner_id explicitly so
// the insert passes the policy's WITH CHECK.

const ROOM_FIELDS =
  "id, title, rent, location, cleanliness, social_level, sleep_schedule, pets_allowed, smoking_allowed, owner_id";

async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You need to be signed in.");
  return user.id;
}

// Only the columns a user may write. Strips id (generated always — can't be
// updated), owner_id, and created_at so they can't be tampered with.
const WRITABLE = [
  "title",
  "rent",
  "location",
  "cleanliness",
  "social_level",
  "sleep_schedule",
  "pets_allowed",
  "smoking_allowed",
];

function writable(room) {
  const out = {};
  for (const k of WRITABLE) if (k in room) out[k] = room[k];
  return out;
}

// Rooms owned by the signed-in user (seed rooms have owner_id null, so excluded).
export async function fetchMyRooms() {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("rooms")
    .select(ROOM_FIELDS)
    .eq("owner_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load your listings: ${error.message}`);
  return data ?? [];
}

export async function createRoom(room) {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("rooms")
    .insert({ ...writable(room), owner_id: uid })
    .select(ROOM_FIELDS)
    .single();
  if (error) throw new Error(`Couldn't save the room: ${error.message}`);
  return data;
}

export async function updateRoom(id, room) {
  const { data, error } = await supabase
    .from("rooms")
    .update(writable(room))
    .eq("id", id)
    .select(ROOM_FIELDS)
    .single();
  if (error) throw new Error(`Couldn't update the room: ${error.message}`);
  return data;
}

export async function deleteRoom(id) {
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) throw new Error(`Couldn't delete the room: ${error.message}`);
}
