import { useState } from "react";
import Avatar from "./Avatar.jsx";

// One ramp, used for both the total score and each factor bar, so the color
// always means the same thing: how well this piece fits.
function rampColor(ratio) {
  if (ratio >= 0.75) return "var(--fit-high)";
  if (ratio >= 0.5) return "var(--fit-mid)";
  return "var(--fit-low)";
}

// Circular fit gauge — the score "pops" as a ring. Bigger for the top match.
function Gauge({ score, hero }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = rampColor(score / 100);
  return (
    <div className={hero ? "gauge gauge-hero" : "gauge"}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="gauge-track" cx="50" cy="50" r={r} />
        <circle
          className="gauge-fill"
          cx="50"
          cy="50"
          r={r}
          style={{ stroke: color, strokeDasharray: circ, strokeDashoffset: offset }}
        />
      </svg>
      <div className="gauge-label">
        <span className="gauge-num" style={{ color }}>
          {score}
        </span>
        <span className="gauge-cap">fit</span>
      </div>
    </div>
  );
}

// Swipeable photo strip. CSS scroll-snap does the swiping; the only JS here is
// tracking which photo is centred so the dots can follow it.
function Gallery({ photos }) {
  const [at, setAt] = useState(0);

  if (photos.length === 0) {
    return <div className="room-photo room-photo-empty">No photo yet</div>;
  }
  if (photos.length === 1) {
    return <img className="room-photo" src={photos[0]} alt="" loading="lazy" />;
  }
  return (
    <div className="gallery">
      <div
        className="gallery-strip"
        onScroll={(e) =>
          setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))
        }
      >
        {photos.map((url) => (
          <img key={url} className="room-photo" src={url} alt="" loading="lazy" />
        ))}
      </div>
      <div className="gallery-dots" aria-hidden="true">
        {photos.map((url, i) => (
          <span key={url} className={i === at ? "dot on" : "dot"} />
        ))}
      </div>
    </div>
  );
}

export default function RoomCard({
  ranked,
  defaultOpen = false,
  hero = false,
  saved = false,
  onToggleSave, // omitted (e.g. on your own listing) → no heart is rendered
  owner, // the owner's profile, when the room has one
  onMessage, // omitted on your own room, and on ownerless seed rooms
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { room, total_score, factors } = ranked;

  // photo_url is the pre-photos[] fallback, kept in sync as the cover.
  const photos = room.photos?.length
    ? room.photos
    : room.photo_url
    ? [room.photo_url]
    : [];

  return (
    <article className={hero ? "card card-hero" : "card"}>
      {/* alt="" on purpose: the title sits directly below, so the images are
          decorative and a real alt would announce the room twice. */}
      <div className="card-media">
        <Gallery photos={photos} />
        {onToggleSave && (
          <button
            type="button"
            className={saved ? "save-btn on" : "save-btn"}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved rooms" : "Save this room"}
            onClick={() => onToggleSave(room.id, !saved)}
          >
            {saved ? "♥" : "♡"}
          </button>
        )}
      </div>

      <div className="card-top">
        <div>
          <h3 className="room-title">{room.title}</h3>
          <p className="room-meta">
            ${room.rent}/mo · {room.location}
          </p>
        </div>
        <Gauge score={total_score} hero={hero} />
      </div>

      {/* Seed rooms genuinely have no owner, so we say so rather than
          inventing a persona for them to be messaged. */}
      {room.owner_id ? (
        <div className="owner-row">
          <Avatar profile={owner} size={24} />
          <span className="owner-name">
            {owner?.first_name?.trim() || "Someone"}
          </span>
          {onMessage && (
            <button
              type="button"
              className="linkish owner-msg"
              onClick={() => onMessage(room)}
            >
              Message
            </button>
          )}
        </div>
      ) : (
        <p className="sample-tag">Sample listing</p>
      )}

      {open && (
        <div className="receipt">
          {factors.map((f) => {
            const ratio = f.score / f.max_score;
            return (
              <div className="factor" key={f.factor}>
                <span className="factor-name">{f.factor}</span>
                <span className="factor-pts">
                  {f.score}/{f.max_score}
                </span>
                <div className="bar">
                  <span
                    style={{ width: `${ratio * 100}%`, "--fill": rampColor(ratio) }}
                  />
                </div>
                <span className="factor-reason">{f.reason}</span>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide the breakdown" : "Why this score?"}
      </button>
    </article>
  );
}
