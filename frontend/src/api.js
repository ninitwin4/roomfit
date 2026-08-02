// Single place that knows about the ranking backend.
// Rooms come from Supabase and are posted along with the preferences, so the
// backend stays stateless and holds no database credentials.

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Render's free tier sleeps after ~15 minutes idle, and the first request after
// that waits ~30s for the container to boot — which is the whole reason a match
// ever feels slow (warm, the round trip is ~100ms). Ping it the moment the app
// loads so it wakes up while the user is still filling in the form.
// Fire and forget: if this fails, the real request still works.
export function warmUp() {
  fetch(`${BASE}/health`).catch(() => {});
}

// The backend's Room model only declares the scored fields, so anything else we
// send is uploaded and then thrown away. Photo URLs are long and there can be
// five per room, so stripping them cuts the request body by ~60%.
const SCORED_FIELDS = [
  "id",
  "title",
  "rent",
  "location",
  "cleanliness",
  "social_level",
  "sleep_schedule",
  "pets_allowed",
  "smoking_allowed",
  "owner_id",
];

const forRanking = (room) =>
  Object.fromEntries(
    SCORED_FIELDS.filter((k) => k in room).map((k) => [k, room[k]])
  );

export async function rankRooms(preferences, rooms) {
  const res = await fetch(`${BASE}/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences, rooms: rooms?.map(forRanking) }),
  });

  if (!res.ok) {
    throw new Error(
      res.status === 422
        ? "Some answers were out of range. Check your budget and 1–5 ratings."
        : `Ranking service returned ${res.status}.`
    );
  }
  return res.json();
}
