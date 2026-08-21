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

// --- profiles ---------------------------------------------------------------

const PROFILE_FIELDS = "id, first_name, last_name, avatar_url, avatar_color";

export function displayName(profile) {
  if (!profile) return null;
  const name = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || null;
}

// Returns null when the user has no profile row yet — that's the signal to ask
// for their name. Throws only on a real failure, so callers can fail soft.
export async function fetchMyProfile() {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", uid)
    .maybeSingle(); // no row is a valid answer here, not an error
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  return data;
}

export async function saveMyProfile(fields) {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: uid, ...fields }, { onConflict: "id" })
    .select(PROFILE_FIELDS)
    .single();
  if (error) throw new Error(`Couldn't save your name: ${error.message}`);
  return data;
}

// Profiles for a set of user ids, as a Map keyed by id. Used to put a name and
// avatar on other people's listings and message threads.
export async function fetchProfilesByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .in("id", unique);
  if (error) throw new Error(`Couldn't load profiles: ${error.message}`);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

// --- messaging --------------------------------------------------------------
// A thread is (room_id, the other participant). RLS restricts every read to
// threads you're part of, so the filters below only narrow — they never
// protect. Never rely on a filter for privacy here.

const MESSAGE_FIELDS = "id, room_id, sender_id, recipient_id, body, created_at";

export async function fetchThread(roomId, otherId) {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_FIELDS)
    .eq("room_id", roomId)
    .or(`sender_id.eq.${otherId},recipient_id.eq.${otherId}`)
    .order("created_at");
  if (error) throw new Error(`Couldn't load the conversation: ${error.message}`);
  return data ?? [];
}

export async function sendMessage({ roomId, recipientId, body }) {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      room_id: roomId,
      sender_id: uid,
      recipient_id: recipientId,
      body: body.trim(),
    })
    .select(MESSAGE_FIELDS)
    .single();
  if (error) throw new Error(`Couldn't send that message: ${error.message}`);
  return data;
}

// Every message you're part of, newest first, grouped into threads in JS.
// Grouping client-side avoids a view or an RPC; at demo volumes it's nothing.
export async function fetchInbox() {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("messages")
    .select(`${MESSAGE_FIELDS}, rooms (id, title, photos, photo_url)`)
    .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Couldn't load your messages: ${error.message}`);

  const threads = new Map();
  for (const m of data ?? []) {
    const otherId = m.sender_id === uid ? m.recipient_id : m.sender_id;
    const key = `${m.room_id}:${otherId}`;
    // rows arrive newest-first, so the first one we see per key is the latest
    if (!threads.has(key)) {
      threads.set(key, {
        key,
        roomId: m.room_id,
        room: m.rooms,
        otherId,
        last: m,
        lastFromMe: m.sender_id === uid,
      });
    }
  }
  return [...threads.values()];
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
const AVATAR_BUCKET = "avatars";

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
async function uploadImage(bucket, file, maxEdge, quality) {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large.");

  const uid = await currentUserId();
  const blob = await downscale(file, maxEdge, quality);
  const path = `${uid}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Couldn't upload the image: ${error.message}`);

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export const uploadRoomPhoto = (file, maxEdge = 1200) =>
  uploadImage(PHOTO_BUCKET, file, maxEdge, 0.8);

// Avatars render at most ~72px, so 256 is plenty and lands around 15 KB.
export const uploadAvatar = (file) =>
  uploadImage(AVATAR_BUCKET, file, 256, 0.85);

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
