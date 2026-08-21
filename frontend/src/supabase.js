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
      "id, title, rent, location, cleanliness, social_level, sleep_schedule, pets_allowed, smoking_allowed, owner_id, photo_url, photos"
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
  "id, title, rent, location, cleanliness, social_level, sleep_schedule, pets_allowed, smoking_allowed, owner_id, photo_url, photos";

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
  "photos",
];

function writable(room) {
  const out = {};
  for (const k of WRITABLE) if (k in room) out[k] = room[k];
  // Keep the legacy single-cover column in sync with photos[0]. Derived in one
  // place so the two can't drift, and it keeps photo_url a valid fallback until
  // it's dropped in a later migration.
  if ("photos" in room) out.photo_url = room.photos?.[0] ?? null;
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

// --- saved / favourite rooms ------------------------------------------------
// RLS scopes every one of these to the signed-in user, so a favourite is
// private. Reads fail soft: favourites are an enhancement, and a problem here
// should never stop someone from matching.

export async function fetchFavouriteIds() {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("favourites")
    .select("room_id")
    .eq("user_id", uid);
  if (error) throw new Error(`Couldn't load your saved rooms: ${error.message}`);
  return new Set((data ?? []).map((r) => String(r.room_id)));
}

export async function toggleFavourite(roomId, on) {
  const uid = await currentUserId();
  const { error } = on
    ? await supabase
        .from("favourites")
        .upsert({ user_id: uid, room_id: roomId }, { onConflict: "user_id,room_id" })
    : await supabase
        .from("favourites")
        .delete()
        .eq("user_id", uid)
        .eq("room_id", roomId);
  if (error) throw new Error(`Couldn't update your saved rooms: ${error.message}`);
}

// The full room rows the user has saved, newest save first.
export async function fetchFavouriteRooms() {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("favourites")
    .select(`created_at, rooms (${ROOM_FIELDS})`)
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load your saved rooms: ${error.message}`);
  // Embedded row is null if the room was deleted mid-flight; drop those.
  return (data ?? []).map((r) => r.rooms).filter(Boolean);
}

// --- photos (Phase 1) -------------------------------------------------------
// Phone photos are 3–5 MB; we downscale in the browser before uploading, which
// keeps the free tier happy and the app fast on mobile data. Canvas only — no
// image library, no new dependency.

const PHOTO_BUCKET = "room-photos";

async function downscale(file, maxEdge = 1200, quality = 0.8) {
  // imageOrientation is explicit so a sideways iPhone photo isn't rendered
  // rotated (the EXIF default varies by browser).
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC and other formats the browser can't decode land here.
    throw new Error("Couldn't read that image — try a JPEG or PNG.");
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close(); // free the full-size decode immediately — matters on phones

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))),
      "image/jpeg",
      quality
    )
  );
}

// Uploads a downscaled JPEG and returns its public URL. Path is
// {uid}/{uuid}.jpg — the storage policy only lets you write your own folder.
export async function uploadRoomPhoto(file, maxEdge = 1200) {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large.");

  const uid = await currentUserId();
  const blob = await downscale(file, maxEdge);
  const path = `${uid}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Couldn't upload the photo: ${error.message}`);

  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Best effort: a failed cleanup must never block deleting or editing a room.
// Note storage.remove() resolves without an error when RLS blocks it, so this
// is genuinely fire-and-forget — don't infer success from the absence of a throw.
export async function deleteRoomPhoto(url) {
  if (!url) return;
  const path = url.split(`/${PHOTO_BUCKET}/`)[1];
  if (!path) return; // not one of ours (e.g. a seed photo set from the dashboard)
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}
