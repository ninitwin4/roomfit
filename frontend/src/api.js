// Single place that knows about the ranking backend.
// Rooms come from Supabase and are posted along with the preferences, so the
// backend stays stateless and holds no database credentials.

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export async function rankRooms(preferences, rooms) {
  const res = await fetch(`${BASE}/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences, rooms }),
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
