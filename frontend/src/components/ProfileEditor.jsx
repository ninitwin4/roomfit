import { useState } from "react";
import { saveMyProfile, uploadAvatar } from "../supabase.js";
import Avatar, { COLOR_KEYS, AVATAR_COLORS } from "./Avatar.jsx";

// Opened by tapping your name in the header. Edits the avatar and the name in
// one sheet — the only identity settings there are.
export default function ProfileEditor({ profile, onSave, onClose }) {
  const [first, setFirst] = useState(profile?.first_name ?? "");
  const [last, setLast] = useState(profile?.last_name ?? "");
  const [url, setUrl] = useState(profile?.avatar_url ?? null);
  const [color, setColor] = useState(profile?.avatar_color ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const valid = first.trim() && last.trim();
  const preview = { ...profile, first_name: first, last_name: last };

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setUrl(await uploadAvatar(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSave(
        await saveMyProfile({
          first_name: first.trim(),
          last_name: last.trim(),
          avatar_url: url,
          avatar_color: color,
        })
      );
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Edit your profile"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <button
            type="button"
            className="sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
          <span className="sheet-title">Edit profile</span>
          <button
            type="button"
            className="sheet-save"
            disabled={!valid || busy || uploading}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="sheet-body">
          <div className="avatar-preview">
            <Avatar profile={preview} url={url} color={color} size={104} />
          </div>

          <div className="avatar-options">
            <label className="avatar-option" title="Upload a photo">
              {uploading ? "…" : "📷"}
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={pickPhoto}
              />
            </label>

            {COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={
                  !url && color === key ? "avatar-option on" : "avatar-option"
                }
                style={{
                  background: AVATAR_COLORS[key].bg,
                  color: AVATAR_COLORS[key].ink,
                }}
                aria-label={`Use ${key} initials`}
                aria-pressed={!url && color === key}
                onClick={() => {
                  setColor(key);
                  setUrl(null); // choosing a colour means "use initials"
                }}
              >
                {(first.trim()[0] ?? "?").toUpperCase()}
              </button>
            ))}
          </div>

          {url && (
            <p className="avatar-hint">
              <button
                type="button"
                className="linkish"
                onClick={() => setUrl(null)}
              >
                Use initials instead
              </button>
            </p>
          )}

          <div className="field">
            <label htmlFor="p-first">First name</label>
            <input
              id="p-first"
              type="text"
              autoComplete="given-name"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="p-last">Last name</label>
            <input
              id="p-last"
              type="text"
              autoComplete="family-name"
              value={last}
              onChange={(e) => setLast(e.target.value)}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
