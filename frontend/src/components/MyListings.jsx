import { useEffect, useRef, useState } from "react";
import {
  fetchMyRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  deleteRoomPhoto,
  setRoomActive,
  fetchRoomSources,
  saveRoomSource,
  fetchLiveClaimLinks,
  createClaimLink,
  claimUrl,
  getClaim,
  acceptClaim,
} from "../supabase.js";
import RoomForm from "./RoomForm.jsx";

const SLEEP_LABEL = { early: "Early risers", late: "Night owls", flexible: "Flexible" };

// What a claimer sees when their link can't be used. No platform names, and
// always a way forward.
const CLAIM_PROBLEMS = {
  used: "This link has already been used. If this is your listing, message us and we'll send you a new one.",
  expired: "This link has expired. Message us and we'll send you a new one.",
  invalid: "This link isn't valid. Check you opened the whole link, or message us for a new one.",
  own: "This listing is already yours — you'll find it in your listings.",
  claimed_by_you: "You've already claimed this listing — you'll find it in your listings.",
  signed_out: "Sign in to claim this listing.",
};

const shortDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// `claimToken` is set when someone arrived through a claim link: the tab shows
// the claim screen instead of the list until they accept or cancel.
export default function MyListings({ isAdmin = false, claimToken = null, onClaimDone }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null); // { tone: "ok" | "error", text }

  const [editing, setEditing] = useState(null); // null | "new" | room
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null); // room being paused or linked

  // admin extras
  const [sources, setSources] = useState(() => new Map()); // roomId -> url
  const [links, setLinks] = useState(() => new Map()); // roomId -> live link
  const [sharing, setSharing] = useState(null); // room whose share sheet is open
  const [shareError, setShareError] = useState(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const mine = await fetchMyRooms();
      setRooms(mine);
      if (isAdmin) {
        // Fail soft: the listings themselves matter more than the admin extras.
        const ids = mine.map((r) => r.id);
        const [s, l] = await Promise.all([
          fetchRoomSources(ids).catch(() => new Map()),
          fetchLiveClaimLinks(ids).catch(() => new Map()),
        ]);
        setSources(s);
        setLinks(l);
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // isAdmin can flip to true after mount, once the profile has loaded.
  useEffect(() => {
    load();
  }, [isAdmin]);

  async function handleSave(room) {
    setSaving(true);
    setSaveError(null);
    let saved;
    try {
      saved =
        editing === "new" ? await createRoom(room) : await updateRoom(editing.id, room);
    } catch (err) {
      setSaveError(err.message);
      setSaving(false);
      return;
    }
    // The room is saved at this point. If only the original post link fails,
    // close the form anyway — saving again would add the room a second time.
    if (isAdmin) {
      try {
        await saveRoomSource(saved.id, room.source_url);
      } catch (err) {
        setNotice({ tone: "error", text: err.message });
      }
    }
    setSaving(false);
    setEditing(null);
    await load();
  }

  // Takes the whole room (already in scope) so we can clean up its stored image
  // without another query. Photo cleanup is best effort — if it fails, the row
  // still gets deleted rather than leaving an undeletable listing.
  async function handleDelete(room) {
    try {
      const urls = room.photos?.length ? room.photos : [room.photo_url];
      for (const url of urls) await deleteRoomPhoto(url);
      await deleteRoom(room.id);
      setConfirmingId(null);
      await load();
    } catch (err) {
      setLoadError(err.message);
    }
  }

  async function togglePause(room) {
    setBusyId(room.id);
    try {
      await setRoomActive(room.id, !room.active);
      await load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  // Opens the share sheet, creating a link only if there isn't a working one.
  // Making a new link on every tap would silently kill the one already sent.
  async function openShare(room) {
    setShareError(null);
    if (links.has(String(room.id))) {
      setSharing(room);
      return;
    }
    setBusyId(room.id);
    try {
      await makeLink(room);
      setSharing(room);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  async function makeLink(room) {
    const link = await createClaimLink(room.id);
    setLinks((prev) => new Map(prev).set(String(room.id), link));
  }

  async function replaceLink(room) {
    setShareError(null);
    try {
      await makeLink(room);
    } catch (err) {
      setShareError(err.message);
    }
  }

  function finishClaim(result) {
    if (result === "claimed") {
      setNotice({
        tone: "ok",
        text: "Your listing is live — people can find it in search now.",
      });
    }
    onClaimDone?.();
    load();
  }

  if (claimToken) {
    return <ClaimListing token={claimToken} onDone={finishClaim} />;
  }

  if (editing !== null) {
    return (
      <RoomForm
        initial={editing === "new" ? null : editing}
        isAdmin={isAdmin}
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
      {sharing && (
        <ShareSheet
          room={sharing}
          link={links.get(String(sharing.id))}
          sourceUrl={sources.get(String(sharing.id))}
          error={shareError}
          onReplace={() => replaceLink(sharing)}
          onClose={() => setSharing(null)}
        />
      )}

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

      {notice && (
        <div className={notice.tone === "ok" ? "notice notice-ok" : "notice"}>
          <p>{notice.text}</p>
          <button type="button" className="linkish" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

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
        rooms.map((room) => {
          const live = links.get(String(room.id));
          const busy = busyId === room.id;
          return (
            <article className="card listing" key={room.id}>
              {room.photos?.length || room.photo_url ? (
                <img
                  className="room-photo"
                  src={room.photos?.[0] ?? room.photo_url}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div className="room-photo room-photo-empty">Add a photo</div>
              )}
              <h3 className="room-title">{room.title}</h3>
              <p className="room-meta">
                ${room.rent}/mo · {room.location}
              </p>
              {room.active === false && (
                <p className="status-tag">
                  {isAdmin ? "Inactive" : "Paused"} · not shown in search
                </p>
              )}
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
                    onClick={() =>
                      setEditing({
                        ...room,
                        source_url: sources.get(String(room.id)) ?? "",
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="linkish"
                    disabled={busy}
                    onClick={() => togglePause(room)}
                  >
                    {room.active === false ? "Show again" : "Pause listing"}
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

              {isAdmin && (
                <div className="admin-row">
                  <div className="admin-row-main">
                    <button
                      type="button"
                      className="linkish"
                      disabled={busy}
                      onClick={() => openShare(room)}
                    >
                      {busy ? "Working…" : live ? "Show link" : "Create link"}
                    </button>
                    <span className="link-status">
                      {live
                        ? `Link sent · expires ${shortDate(live.expires_at)}`
                        : room.active === false
                        ? "Not shared yet"
                        : ""}
                    </span>
                  </div>
                  <span className="admin-hint">Admin feature</span>
                </div>
              )}
            </article>
          );
        })}
    </>
  );
}

// The claim screen: the normal room form, prefilled, with "Accept and publish".
function ClaimListing({ token, onDone }) {
  const [state, setState] = useState({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getClaim(token)
      .then((res) => alive && setState(res ?? { status: "invalid" }))
      .catch((err) => alive && setState({ status: "error", message: err.message }));
    return () => {
      alive = false;
    };
  }, [token]);

  async function accept(room) {
    setSaving(true);
    setError(null);
    try {
      await acceptClaim(token, room);
      onDone("claimed");
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (state.status === "loading") {
    return <p className="filtered-note">Opening your listing…</p>;
  }

  if (state.status !== "ok") {
    return (
      <div className="notice">
        <p>
          {CLAIM_PROBLEMS[state.status] ??
            state.message ??
            "Something went wrong opening this link."}
        </p>
        <button type="button" className="linkish" onClick={() => onDone("dismissed")}>
          Go to my listings
        </button>
      </div>
    );
  }

  return (
    <RoomForm
      mode="claim"
      initial={state.room}
      onSave={accept}
      onCancel={() => onDone("cancelled")}
      saving={saving}
      error={error}
    />
  );
}

// Admin: the claim link to send, and the original post it came from.
function ShareSheet({ room, link, sourceUrl, error, onReplace, onClose }) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [replacing, setReplacing] = useState(false);

  async function replace() {
    setReplacing(true);
    await onReplace();
    setReplacing(false);
    setConfirmReplace(false);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${room.title}`}
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
          <span className="sheet-title share-title">Share “{room.title}”</span>
          <span className="sheet-spacer" aria-hidden="true" />
        </div>

        <div className="sheet-body">
          <div className="field">
            <span className="field-label">Claim link — send this to the owner</span>
            {link ? (
              <>
                <CopyRow value={claimUrl(link.token)} />
                <span className="hint share-meta">
                  Works once · expires {shortDate(link.expires_at)}
                </span>
              </>
            ) : (
              <p className="hint">No working link — tap Replace link to make one.</p>
            )}
          </div>

          <div className="field">
            <span className="field-label">Original post</span>
            {sourceUrl ? (
              <CopyRow value={sourceUrl} openable />
            ) : (
              <p className="auth-error">No original post saved. Add it with Edit.</p>
            )}
          </div>

          {error && <p className="auth-error">{error}</p>}

          <div className="share-foot">
            {confirmReplace ? (
              <>
                <span className="confirm-q">The old link will stop working.</span>
                <button
                  type="button"
                  className="linkish danger"
                  disabled={replacing}
                  onClick={replace}
                >
                  {replacing ? "Replacing…" : "Replace"}
                </button>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setConfirmReplace(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setConfirmReplace(true)}
                >
                  Replace link
                </button>
                <button type="button" className="linkish share-close" onClick={onClose}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A read-only field with a Copy button (and optionally Open).
function CopyRow({ value, openable = false }) {
  const [label, setLabel] = useState("Copy");
  const inputRef = useRef(null);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // The clipboard API needs https or localhost. Fall back to selecting the
      // text so it can be copied by hand — and don't claim it was copied.
      inputRef.current?.select();
      ok = document.execCommand?.("copy") ?? false;
    }
    setLabel(ok ? "Copied ✓" : "Selected");
    setTimeout(() => setLabel("Copy"), 1500);
  }

  return (
    <div className="copy-row">
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className="copy-btn" onClick={copy}>
        {label}
      </button>
      {openable && (
        <a className="copy-btn" href={value} target="_blank" rel="noopener noreferrer">
          Open
        </a>
      )}
    </div>
  );
}
