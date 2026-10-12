import { useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import { Gallery, postedLabel } from "./RoomCard.jsx";
import { fetchSharedRoom, fetchRoomOwnerId, teamManaged } from "../supabase.js";

const SLEEP_LABEL = { early: "Early risers", late: "Night owls", flexible: "Flexible hours" };

// One room, opened from a link its owner shared (/r/<id>). Anyone can see it,
// signed in or not. There's no fit score: a visitor hasn't said what they're
// after yet, and that's the reason to sign up. So the room's own facts are
// shown plainly, and the household as facts rather than a match.
//
// `me` is the signed-in user's id, or null. Signed in, it offers Message;
// signed out, App puts the sign-up form underneath.
export default function SharedRoom({ id, me = null, onMessage, onLeave }) {
  const [state, setState] = useState({ status: "loading" }); // loading | ok | gone | error
  const [ownerId, setOwnerId] = useState(null);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchSharedRoom(id)
      .then((room) => alive && setState(room ? { status: "ok", room } : { status: "gone" }))
      .catch((err) => alive && setState({ status: "error", message: err.message }));
    // The public room never carries its owner's id; signed in, ask for it so
    // Message knows who to write to.
    if (me) {
      fetchRoomOwnerId(id)
        .then((owner) => alive && setOwnerId(owner))
        .catch(() => {}); // no Message button, the room still shows
    }
    return () => {
      alive = false;
    };
  }, [id, me]);

  if (state.status === "loading") {
    return <p className="filtered-note">Opening this room…</p>;
  }

  if (state.status !== "ok") {
    return (
      <div className="notice shared-gone">
        <p>
          {state.status === "gone"
            ? "This room isn't listed any more. It may have been taken."
            : state.message}
        </p>
        <button type="button" className="linkish" onClick={onLeave}>
          {me ? "Find rooms that fit you" : "See what roomfit does"}
        </button>
      </div>
    );
  }

  const room = state.room;
  const owner = {
    first_name: room.owner_first_name,
    avatar_url: room.owner_avatar_url,
    avatar_color: room.owner_avatar_color,
  };
  const ownerName = teamManaged(room)
    ? "the RoomFit team"
    : room.owner_first_name?.trim() || "the owner";
  const description = room.description?.trim();
  const mine = !!me && ownerId === me;

  return (
    <>
      <article className="card shared-room">
        <div className="card-media">
          <Gallery photos={room.photos ?? []} />
        </div>

        <h2 className="room-title">{room.title}</h2>
        <p className="room-meta">
          ${room.rent}/mo · {room.location}
          {room.posted_at && <> · {postedLabel(room.posted_at)}</>}
        </p>

        <div className="owner-row">
          {teamManaged(room) ? (
            <span className="owner-pending">Room managed by RoomFit team</span>
          ) : (
            <>
              <Avatar profile={owner} size={24} />
              <span className="owner-name">{room.owner_first_name?.trim() || "Someone"}</span>
            </>
          )}
          {mine ? (
            <span className="interest-sent">Your room</span>
          ) : (
            me &&
            ownerId &&
            onMessage && (
              <button
                type="button"
                className="linkish owner-msg"
                onClick={() => onMessage({ ...room, owner_id: ownerId })}
              >
                Message
              </button>
            )
          )}
        </div>

        <p className="shared-label">The household</p>
        <p className="listing-traits">
          Tidiness {room.cleanliness}/5 · Social {room.social_level}/5 ·{" "}
          {SLEEP_LABEL[room.sleep_schedule]} · Pets{" "}
          {room.pets_allowed ? "allowed" : "not allowed"} · Smoking{" "}
          {room.smoking_allowed ? "allowed" : "not allowed"}
        </p>

        {/* Plain text only, as on every card: React escapes it. */}
        {description && <div className="room-desc">{description}</div>}
      </article>

      {me ? (
        <div className="shared-cta">
          <button type="button" className="linkish" onClick={onLeave}>
            Find rooms that fit you
          </button>
        </div>
      ) : (
        <p className="claim-banner">
          <strong>How well does this room fit you?</strong> roomfit scores every
          room on budget, area, tidiness, social life and hours, and shows you
          why. Create a free account to message {ownerName} and find the rooms
          that fit you best.
        </p>
      )}
    </>
  );
}
