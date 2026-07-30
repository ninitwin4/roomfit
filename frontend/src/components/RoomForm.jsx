import { useEffect, useState } from "react";
import { fetchLocations, uploadRoomPhoto } from "../supabase.js";
import Scale from "./Scale.jsx";

const BLANK = {
  title: "",
  rent: 900,
  location: "",
  cleanliness: 3,
  social_level: 3,
  sleep_schedule: "flexible",
  pets_allowed: false,
  smoking_allowed: false,
  photo_url: null,
};

// Add or edit one room. `initial` is a room to edit, or null to add a new one.
export default function RoomForm({ initial, onSave, onCancel, saving, error }) {
  const [room, setRoom] = useState(() => ({ ...BLANK, ...(initial ?? {}) }));
  const [areas, setAreas] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [preview, setPreview] = useState(null); // local blob URL, shown instantly

  useEffect(() => {
    let alive = true;
    fetchLocations()
      .then((list) => alive && setAreas(list))
      .catch(() => {}); // suggestions are optional; typing still works
    return () => {
      alive = false;
    };
  }, []);

  // Revokes the previous blob URL whenever it changes, and on unmount.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const set = (key, value) => setRoom((r) => ({ ...r, [key]: value }));
  const valid = room.title.trim() && room.location.trim() && room.rent >= 0;

  // Upload on select rather than on save, so by the time you hit Save the photo
  // is just another string field. We deliberately don't delete the previous
  // image here: if you replace a photo and then Cancel, the saved room would be
  // left pointing at a deleted file. Orphans are ~200 KB; broken images aren't.
  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a remove
    if (!file) return;

    setPhotoError(null);
    setPreview(URL.createObjectURL(file));
    setPhotoBusy(true);
    try {
      set("photo_url", await uploadRoomPhoto(file));
    } catch (err) {
      setPhotoError(err.message);
      setPreview(null);
    } finally {
      setPhotoBusy(false);
    }
  }

  const shownPhoto = preview || room.photo_url;

  return (
    <div className="panel">
      <h2 className="form-title">{initial ? "Edit room" : "Add a room"}</h2>

      <div className="field">
        <label htmlFor="room-title">Title</label>
        <input
          id="room-title"
          type="text"
          placeholder="Sunny room in a Mission flat"
          value={room.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>

      <div className="field">
        <span className="field-label">Photo</span>
        <span className="hint">One cover photo. Optional.</span>

        {shownPhoto ? (
          <img className="room-photo" src={shownPhoto} alt="" />
        ) : (
          <div className="room-photo room-photo-empty">No photo yet</div>
        )}

        <div className="photo-actions">
          <label className="photo-pick">
            {shownPhoto ? "Replace photo" : "Choose a photo"}
            <input
              type="file"
              accept="image/*"
              disabled={photoBusy}
              onChange={handlePhoto}
            />
          </label>
          {shownPhoto && !photoBusy && (
            <button
              type="button"
              className="linkish danger"
              onClick={() => {
                setPreview(null);
                set("photo_url", null);
                setPhotoError(null);
              }}
            >
              Remove
            </button>
          )}
        </div>

        {photoBusy && <p className="hint">Uploading…</p>}
        {photoError && <p className="auth-error">{photoError}</p>}
      </div>

      <div className="field">
        <label htmlFor="room-rent">Monthly rent</label>
        <div className="budget-input">
          <span className="budget-prefix" aria-hidden="true">
            $
          </span>
          <input
            id="room-rent"
            type="text"
            inputMode="numeric"
            value={room.rent}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              set("rent", digits === "" ? 0 : parseInt(digits, 10));
            }}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="room-location">Location</label>
        <span className="hint">Pick an area or type a new one.</span>
        <input
          id="room-location"
          type="text"
          list="area-options"
          placeholder="Mission"
          value={room.location}
          onChange={(e) => set("location", e.target.value)}
        />
        <datalist id="area-options">
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </div>

      <div className="field">
        <span className="field-label" id="room-tidy-label">
          How tidy the place is
        </span>
        <Scale
          value={room.cleanliness}
          low="Relaxed"
          high="Spotless"
          labelId="room-tidy-label"
          onChange={(v) => set("cleanliness", v)}
        />
      </div>

      <div className="field">
        <span className="field-label" id="room-social-label">
          How social the home is
        </span>
        <Scale
          value={room.social_level}
          low="Quiet"
          high="Very social"
          labelId="room-social-label"
          onChange={(v) => set("social_level", v)}
        />
      </div>

      <div className="field">
        <label htmlFor="room-sleep">Household hours</label>
        <select
          id="room-sleep"
          value={room.sleep_schedule}
          onChange={(e) => set("sleep_schedule", e.target.value)}
        >
          <option value="early">Early risers</option>
          <option value="late">Night owls</option>
          <option value="flexible">Flexible</option>
        </select>
      </div>

      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={room.pets_allowed}
            onChange={(e) => set("pets_allowed", e.target.checked)}
          />
          Pets allowed
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={room.smoking_allowed}
            onChange={(e) => set("smoking_allowed", e.target.checked)}
          />
          Smoking allowed
        </label>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="form-actions">
        <button
          type="button"
          className="submit"
          disabled={saving || !valid}
          onClick={() => onSave(room)}
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Add room"}
        </button>
        <button type="button" className="linkish" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
