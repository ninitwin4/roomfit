import { createClient } from "@supabase/supabase-js";

// Both values are safe to expose: the anon key only grants what your Row Level
// Security policies allow. Never put the service_role key in frontend code.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

const ROOM_FIELDS =
  "id, title, rent, location, description, cleanliness, social_level, sleep_schedule, pets_allowed, smoking_allowed, owner_id, photo_url, photos, active";

// Rooms for the Find tab. RLS decides what you MAY read (active rooms, your own,
// and everything for admins); this decides what the search SHOWS: active rooms
// only, unless an admin ticked "Include inactive rooms". Without the filter,
// your own paused listing would turn up in your own search results.
export async function fetchRooms({ includeInactive = false } = {}) {
  let query = supabase.from("rooms").select(ROOM_FIELDS);
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;

  if (error) throw new Error(`Couldn't load rooms: ${error.message}`);
  return data ?? [];
}

// Distinct neighborhoods, for the preference dropdown. Postgres has no cheap
// DISTINCT through the JS client, so we dedupe the location column here. Active
// rooms only, so an unpublished listing's area never shows up in the list.
const LOCATIONS_CACHE = "roomfit:locations";

export async function fetchLocations() {
  let lastError = null;

  // Two attempts. A request that goes out while the access token is mid-refresh
  // comes back 401; by the second attempt the new token has landed. Without
  // this, one unlucky moment on load drops the whole dropdown to a text box.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 600));

    const { data, error } = await supabase
      .from("rooms")
      .select("location")
      .eq("active", true);
    if (error) {
      lastError = error;
      continue;
    }

    const list = [...new Set((data ?? []).map((r) => r.location))].sort((a, b) =>
      a.localeCompare(b)
    );
    // Remember a good list so a later failure can fall back to it.
    if (list.length) {
      try {
        localStorage.setItem(LOCATIONS_CACHE, JSON.stringify(list));
      } catch {
        /* private browsing — the cache is a bonus, not a requirement */
      }
    }
    return list;
  }

  throw new Error(`Couldn't load locations: ${lastError?.message ?? "unknown"}`);
}

// The last list we successfully loaded, or null. Lets the form show real areas
// even when the network call fails.
export function cachedLocations() {
  try {
    const list = JSON.parse(localStorage.getItem(LOCATIONS_CACHE) ?? "null");
    return Array.isArray(list) && list.length ? list : null;
  } catch {
    return null;
  }
}

// --- listings (Session B) ---------------------------------------------------
// All writes are guarded by RLS: users can only insert/update/delete rooms
// where owner_id = auth.uid(). The frontend still sets owner_id explicitly so
// the insert passes the policy's WITH CHECK.

async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You need to be signed in.");
  return user.id;
}

// Only the columns a user may write. Strips id (generated always — can't be
// updated), owner_id, and created_at so they can't be tampered with. `active`
// is writable, but a trigger forces it to true when a non-admin adds a room.
const WRITABLE = [
  "title",
  "rent",
  "location",
  "description",
  "cleanliness",
  "social_level",
  "sleep_schedule",
  "pets_allowed",
  "smoking_allowed",
  "photos",
  "active",
];

export const DESCRIPTION_MAX = 2000; // matches the check in 12_descriptions.sql

// Posts copied from another site often end with that site's "See less" button
// text. Drop it, and store a blank description as null so the card shows no
// Description button for it.
function cleanDescription(text) {
  if (text == null) return null;
  const cleaned = String(text).replace(/\s*see less\s*$/i, "").trim();
  return cleaned || null;
}

function writable(room) {
  const out = {};
  for (const k of WRITABLE) if (k in room) out[k] = room[k];
  if ("description" in out) out.description = cleanDescription(out.description);
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

// Pause / show again. RLS limits this to your own rooms.
export async function setRoomActive(id, active) {
  const { error } = await supabase.from("rooms").update({ active }).eq("id", id);
  if (error) throw new Error(`Couldn't update the listing: ${error.message}`);
}

// --- claimable listings (admin) ---------------------------------------------
// An admin copies a room from another site as an inactive listing, keeps the
// original post link, and sends the owner a one-time claim link. room_sources
// and claim_links are admin-only under RLS; claimers only ever go through the
// get_claim / claim_room functions. See supabase/11_claims.sql.

// Original post links for these rooms, as Map<roomId, url>.
export async function fetchRoomSources(roomIds) {
  if (roomIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("room_sources")
    .select("room_id, source_url")
    .in("room_id", roomIds);
  if (error) throw new Error(`Couldn't load original post links: ${error.message}`);
  return new Map((data ?? []).map((s) => [String(s.room_id), s.source_url]));
}

// Blank clears it. Separate from the room save, so a failure here says so
// rather than failing the whole listing.
export async function saveRoomSource(roomId, url) {
  const trimmed = (url ?? "").trim();
  const { error } = trimmed
    ? await supabase
        .from("room_sources")
        .upsert(
          { room_id: roomId, source_url: trimmed, updated_at: new Date().toISOString() },
          { onConflict: "room_id" }
        )
    : await supabase.from("room_sources").delete().eq("room_id", roomId);
  if (error) throw new Error(`The room saved, but not its original post link: ${error.message}`);
}

// The one still-working claim link per room, as Map<roomId, { token, expires_at }>.
export async function fetchLiveClaimLinks(roomIds) {
  if (roomIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("claim_links")
    .select("room_id, token, expires_at")
    .in("room_id", roomIds)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load claim links: ${error.message}`);
  const out = new Map();
  for (const l of data ?? []) {
    const key = String(l.room_id);
    if (!out.has(key)) out.set(key, l); // newest first, so the first one wins
  }
  return out;
}

// Makes a new link, expiring any old one for the same room.
export async function createClaimLink(roomId) {
  const { data, error } = await supabase.rpc("create_claim_link", { p_room_id: roomId });
  if (error) throw new Error(`Couldn't create the link: ${error.message}`);
  return data;
}

export const CLAIM_PARAM = "claim";

export function claimUrl(token) {
  return `${window.location.origin}/?${CLAIM_PARAM}=${token}`;
}

// { status: "ok", room } or { status: "used" | "expired" | "invalid" | "own" |
// "claimed_by_you" }. Never includes the original post link.
export async function getClaim(token) {
  const { data, error } = await supabase.rpc("get_claim", { p_token: token });
  if (error) throw new Error(`Couldn't open this link: ${error.message}`);
  return data;
}

// Photos the admin uploaded live in the admin's folder. Copy them into the
// claimer's own folder so the claimer really owns them. The copy happens on
// Supabase's servers — nothing is downloaded — and needs no new storage rule:
// room photos are publicly readable, and you may always write your own folder.
// Photos the claimer uploaded themselves are already in their folder.
async function copyPhotosToMyFolder(photos) {
  const uid = await currentUserId();
  const marker = `/${PHOTO_BUCKET}/`;
  const out = [];
  for (const url of photos ?? []) {
    const path = url.split(marker)[1];
    if (!path || path.startsWith(`${uid}/`)) {
      out.push(url); // not in our bucket (e.g. set from the dashboard), or already theirs
      continue;
    }
    const dest = `${uid}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).copy(path, dest);
    if (error) throw new Error(`Couldn't copy the photos: ${error.message}`);
    out.push(supabase.storage.from(PHOTO_BUCKET).getPublicUrl(dest).data.publicUrl);
  }
  return out;
}

// Accept: copy photos first, then claim in one step on the server. If the copy
// fails nothing is claimed, and Accept can simply be tapped again.
export async function acceptClaim(token, room) {
  const photos = await copyPhotosToMyFolder(room.photos);
  const payload = { ...writable(room), photos };
  const { data, error } = await supabase.rpc("claim_room", {
    p_token: token,
    p_room: payload,
  });
  if (error) throw new Error(error.message);
  return data;
}

// --- profiles ---------------------------------------------------------------

const PROFILE_FIELDS = "id, first_name, last_name, avatar_url, avatar_color, role";

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

// Threads this user has hidden, as Map<"roomId:otherId", hiddenAtISO>.
// The timestamp matters: the inbox brings a thread back once a newer message
// arrives, so hiding someone can't silently swallow what they send next.
export async function fetchHiddenThreads() {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("hidden_threads")
    .select("room_id, other_id, created_at")
    .eq("user_id", uid);
  if (error) throw new Error(`Couldn't load your inbox: ${error.message}`);
  return new Map(
    (data ?? []).map((h) => [`${h.room_id}:${h.other_id}`, h.created_at])
  );
}

export async function hideThread(roomId, otherId) {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("hidden_threads")
    .upsert(
      { user_id: uid, room_id: roomId, other_id: otherId, created_at: new Date().toISOString() },
      { onConflict: "user_id,room_id,other_id" }
    )
    .select("created_at")
    .single();
  if (error) throw new Error(`Couldn't remove that conversation: ${error.message}`);
  return data.created_at;
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
  // Embedded row is null if the room was deleted mid-flight, or if it's been
  // paused (RLS hides it). Admins can still read paused rooms, so drop those
  // explicitly too — Saved should match what the Find tab would show.
  return (data ?? []).map((r) => r.rooms).filter((r) => r && r.active !== false);
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
