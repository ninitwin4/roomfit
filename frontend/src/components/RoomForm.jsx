import { useEffect, useState } from "react";
import { fetchLocations, uploadRoomPhoto, DESCRIPTION_MAX } from "../supabase.js";
import Scale from "./Scale.jsx";

const BLANK = {
  title: "",
  rent: 900,
  location: "",
  description: "",
  cleanliness: 3,
  social_level: 3,
  sleep_schedule: "flexible",
  pets_allowed: false,
  smoking_allowed: false,
  photos: [],
};

// Raise this if rooms need more; the grid and the card gallery both adapt.
const MAX_PHOTOS = 5;

// Blank is fine (it's optional); anything else must be a web address.
const isValidLink = (s) => !s.trim() || /^https?:\/\/\S+$/i.test(s.trim());

// Add, edit, or claim one room. `initial` is a room to edit or claim, or null to
// add a new one. `mode` is "add" | "edit" | "claim".
//
// Claim mode is the normal form, prefilled by an admin, with "Accept and
// publish" in place of "Add room". Nothing is written until Accept — every edit
// lives in this component's state, so Cancel leaves the listing untouched.
export default function RoomForm({
  initial,
  mode = initial ? "edit" : "add",
  isAdmin = false,
  onSave,
  onCancel,
  saving,
  error,
}) {
  const claiming = mode === "claim";
  // Admins add rooms hidden by default (they're usually copied from another
  // site and wait to be claimed); everyone else's go live straight away.
  const [room, setRoom] = useState(() => ({
    ...BLANK,
    active: !isAdmin,
    source_url: "",
    ...(initial ?? {}),
  }));
  const [areas, setAreas] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(null);

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
  const showAdmin = isAdmin && !claiming;
  const linkOk = !showAdmin || isValidLink(room.source_url ?? "");
  const valid =
    room.title.trim() && room.location.trim() && room.rent >= 0 && linkOk;
  const photos = room.photos ?? [];

  // Upload on select rather than on save, so by the time you hit Save the
  // photos are just an array of strings. Removing one here doesn't delete the
  // stored file: if you removed a photo and then hit Cancel, the saved room
  // would point at a deleted image. Orphans are ~200 KB; broken images aren't.
  async function handlePhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-picking the same file after a remove
    if (!files.length) return;

    const slots = MAX_PHOTOS - photos.length;
    if (slots <= 0) {
      setPhotoError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setPhotoError(null);
    setPhotoBusy(true);
    try {
      for (const file of files.slice(0, slots)) {
        const url = await uploadRoomPhoto(file);
        // append as each one finishes, so they appear progressively
        setRoom((r) => ({ ...r, photos: [...(r.photos ?? []), url] }));
      }
      if (files.length > slots) {
        setPhotoError(`Added ${slots} — that's the ${MAX_PHOTOS}-photo limit.`);
      }
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  const makeCover = (i) =>
    setRoom((r) => {
      const next = [...r.photos];
      const [picked] = next.splice(i, 1);
      return { ...r, photos: [picked, ...next] };
    });

  const removePhoto = (i) =>
    setRoom((r) => ({ ...r, photos: r.photos.filter((_, n) => n !== i) }));

  return (
    <div className="panel">
      <h2 className="form-title">
        {claiming ? "Claim your listing" : mode === "edit" ? "Edit room" : "Add a room"}
      </h2>

      {claiming && (
        <p className="claim-banner">
          We've set up this listing from the post you shared with us. Check the
          details, make any changes, then tap <strong>Accept and publish</strong>{" "}
          at the bottom.
        </p>
      )}

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
        <span className="field-label">Photos</span>
        <span className="hint">
          Up to {MAX_PHOTOS}. The first one is the cover.
        </span>

        {photos.length === 0 ? (
          <div className="room-photo room-photo-empty">No photos yet</div>
        ) : (
          <ul className="photo-grid">
            {photos.map((url, i) => (
              <li className="photo-item" key={url}>
                <img src={url} alt="" />
                {i === 0 && <span className="cover-badge">Cover</span>}
                <div className="photo-item-actions">
                  {i !== 0 && (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => makeCover(i)}
                    >
                      Make cover
                    </button>
                  )}
                  <button
                    type="button"
                    className="linkish danger"
                    onClick={() => removePhoto(i)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {photos.length < MAX_PHOTOS && (
          <div className="photo-actions">
            <label className="photo-pick">
              {photos.length ? "Add more photos" : "Choose photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={photoBusy}
                onChange={handlePhotos}
              />
            </label>
          </div>
        )}

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
        <label htmlFor="room-description">Description (optional)</label>
        <span className="hint">
          What's the room like, who lives there, what's nearby.
        </span>
        <textarea
          id="room-description"
          rows={6}
          maxLength={DESCRIPTION_MAX}
          value={room.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
        />
        <span className="char-count">
          {(room.description ?? "").length} / {DESCRIPTION_MAX}
        </span>
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

      {/* Admin-only. Hiding these is presentation, not security: the database
          forces non-admin rooms live and keeps room_sources admin-only. */}
      {showAdmin && (
        <div className="admin-block">
          <label className="check">
            <input
              type="checkbox"
              checked={room.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active — shown in search
          </label>
          <span className="admin-hint">
            Admin feature. Leave off until the owner claims the listing.
          </span>

          <div className="field admin-field">
            <label htmlFor="room-source">Original post link</label>
            <input
              id="room-source"
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="https://…"
              value={room.source_url ?? ""}
              onChange={(e) => set("source_url", e.target.value)}
            />
            {!linkOk && (
              <p className="auth-error">Paste the full link, starting with https://</p>
            )}
            <span className="admin-hint">
              Admin feature. Only admins can see this — so you can always find
              the original post and its owner.
            </span>
          </div>
        </div>
      )}

      {error && <p className="auth-error">{error}</p>}

      <div className="form-actions">
        {claiming && (
          <p className="claim-note">
            This confirms it's your room and makes it visible on RoomFit.
          </p>
        )}
        <button
          type="button"
          className="submit"
          disabled={saving || !valid}
          onClick={() => onSave(room)}
        >
          {claiming
            ? saving
              ? "Publishing…"
              : "Accept and publish"
            : saving
            ? "Saving…"
            : mode === "edit"
            ? "Save changes"
            : "Add room"}
        </button>
        <button type="button" className="linkish" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
