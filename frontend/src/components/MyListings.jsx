import { useEffect, useState } from "react";
import {
  fetchMyRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  deleteRoomPhoto,
} from "../supabase.js";
import RoomForm from "./RoomForm.jsx";

const SLEEP_LABEL = { early: "Early risers", late: "Night owls", flexible: "Flexible" };

export default function MyListings() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [editing, setEditing] = useState(null); // null | "new" | room
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setRooms(await fetchMyRooms());
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(room) {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing === "new") await createRoom(room);
      else await updateRoom(editing.id, room);
      setEditing(null);
      await load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Takes the whole room (already in scope) so we can clean up its stored image
  // without another query. Photo cleanup is best effort — if it fails, the row
  // still gets deleted rather than leaving an undeletable listing.
  async function handleDelete(room) {
    try {
      await deleteRoomPhoto(room.photo_url);
      await deleteRoom(room.id);
      setConfirmingId(null);
      await load();
    } catch (err) {
      setLoadError(err.message);
    }
  }

  if (editing !== null) {
    return (
      <RoomForm
        initial={editing === "new" ? null : editing}
        onSave={handleSave}
        onCancel={() => {
          setEditing(null);
          setSaveError(null);
        }}
        saving={saving}
        error={saveError}
      />
    );
  }

  return (
    <>
      <div className="results-head">
        <h2 className="results-count">Your listings</h2>
        <button
          type="button"
          className="linkish"
          onClick={() => setEditing("new")}
        >
          Add a room
        </button>
      </div>

      {loading && <p className="filtered-note">Loading your listings…</p>}

      {loadError && (
        <div className="notice">
          <p>{loadError}</p>
          <button type="button" className="linkish" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && rooms.length === 0 && (
        <div className="notice">
          <p>You haven't listed a room yet.</p>
          <button
            type="button"
            className="linkish"
            onClick={() => setEditing("new")}
          >
            Add your first room
          </button>
        </div>
      )}

      {!loading &&
        !loadError &&
        rooms.map((room) => (
          <article className="card listing" key={room.id}>
            {room.photo_url ? (
              <img className="room-photo" src={room.photo_url} alt="" loading="lazy" />
            ) : (
              <div className="room-photo room-photo-empty">Add a photo</div>
            )}
            <h3 className="room-title">{room.title}</h3>
            <p className="room-meta">
              ${room.rent}/mo · {room.location}
            </p>
            <p className="listing-traits">
              Tidy {room.cleanliness}/5 · Social {room.social_level}/5 ·{" "}
              {SLEEP_LABEL[room.sleep_schedule]} · Pets{" "}
              {room.pets_allowed ? "ok" : "no"} · Smoking{" "}
              {room.smoking_allowed ? "ok" : "no"}
            </p>

            {confirmingId === room.id ? (
              <div className="listing-actions">
                <span className="confirm-q">Delete this listing?</span>
                <button
                  type="button"
                  className="linkish danger"
                  onClick={() => handleDelete(room)}
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setConfirmingId(null)}
                >
                  Keep
                </button>
              </div>
            ) : (
              <div className="listing-actions">
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setEditing(room)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="linkish danger"
                  onClick={() => setConfirmingId(room.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
    </>
  );
}
