import { useEffect, useState } from "react";
import { fetchFavouriteRooms } from "../supabase.js";
import { rankRooms } from "../api.js";
import RoomCard from "./RoomCard.jsx";

export const PREFS_KEY = "roomfit:lastPrefs";

// Explains why a saved room didn't come back from /rank. The backend still
// *decides* what gets filtered — we only diff the ids it returned — so this is
// a label, never a ruling. Mirrors the three hard filters in ranking.py.
function whyFiltered(room, prefs) {
  if (room.rent > prefs.budget_max)
    return `$${room.rent} is over your $${prefs.budget_max} budget`;
  if (prefs.needs_pets && !room.pets_allowed) return "Doesn't allow pets";
  if (!prefs.smoking_ok && room.smoking_allowed) return "Smoking household";
  return "Doesn't meet your current must-haves";
}

export default function SavedRooms({ savedIds, onToggleSave }) {
  const [state, setState] = useState({ status: "loading" });

  async function load() {
    setState({ status: "loading" });
    try {
      const rooms = await fetchFavouriteRooms();
      if (rooms.length === 0) return setState({ status: "empty" });

      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return setState({ status: "noprefs" });
      const prefs = JSON.parse(raw);

      const ranked = await rankRooms(prefs, rooms);

      // Same merge as the main results view: the backend echoes only its scored
      // fields, so photos would be dropped without this.
      const byId = new Map(rooms.map((r) => [String(r.id), r]));
      const results = ranked.results.map((r) => ({
        ...r,
        room: { ...byId.get(String(r.room.id)), ...r.room },
      }));

      // Anything saved but missing from the response failed a hard filter.
      // Show it rather than letting a saved room silently vanish.
      const shown = new Set(results.map((r) => String(r.room.id)));
      const excluded = rooms.filter((r) => !shown.has(String(r.id)));

      setState({ status: "ok", results, excluded, prefs });
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (state.status === "loading") {
    return <p className="filtered-note">Loading your saved rooms…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="notice">
        <p>{state.message}</p>
        <button type="button" className="linkish" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="notice">
        <p>
          Nothing saved yet. Tap the ♡ on any match to keep it here for later.
        </p>
      </div>
    );
  }

  if (state.status === "noprefs") {
    return (
      <div className="notice">
        <p>
          Run a match first and we'll score your saved rooms against those
          preferences.
        </p>
      </div>
    );
  }

  // Un-saving removes a card immediately, without waiting for a refetch.
  const visible = state.results.filter((r) => savedIds.has(String(r.room.id)));
  const excluded = state.excluded.filter((r) => savedIds.has(String(r.id)));

  if (visible.length === 0 && excluded.length === 0) {
    return (
      <div className="notice">
        <p>Nothing saved yet. Tap the ♡ on any match to keep it here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="results-head">
        <h2 className="results-count">
          {visible.length + excluded.length} saved
        </h2>
        <button type="button" className="linkish" onClick={load}>
          Refresh
        </button>
      </div>

      <p className="filtered-note">Scored against your last search.</p>

      {visible.map((r, i) => (
        <RoomCard
          key={r.room.id}
          ranked={r}
          defaultOpen={i === 0}
          hero={i === 0}
          saved={true}
          onToggleSave={onToggleSave}
        />
      ))}

      {excluded.length > 0 && (
        <>
          <p className="filtered-note excluded-head">
            {excluded.length === 1 ? "1 saved room doesn't" : `${excluded.length} saved rooms don't`}{" "}
            match your current preferences:
          </p>
          {excluded.map((room) => (
            <article className="card listing" key={room.id}>
              <h3 className="room-title">{room.title}</h3>
              <p className="room-meta">
                ${room.rent}/mo · {room.location}
              </p>
              <p className="listing-traits">{whyFiltered(room, state.prefs)}</p>
              <div className="listing-actions">
                <button
                  type="button"
                  className="linkish danger"
                  onClick={() => onToggleSave(room.id, false)}
                >
                  Remove from saved
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </>
  );
}
