import { useEffect, useState } from "react";
import { fetchLocations } from "../supabase.js";
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
};

// Add or edit one room. `initial` is a room to edit, or null to add a new one.
export default function RoomForm({ initial, onSave, onCancel, saving, error }) {
  const [room, setRoom] = useState(() => ({ ...BLANK, ...(initial ?? {}) }));
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    let alive = true;
    fetchLocations()
      .then((list) => alive && setAreas(list))
      .catch(() => {}); // suggestions are optional; typing still works
    return () => {
      alive = false;
    };
  }, []);

  const set = (key, value) => setRoom((r) => ({ ...r, [key]: value }));
  const valid = room.title.trim() && room.location.trim() && room.rent >= 0;

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
