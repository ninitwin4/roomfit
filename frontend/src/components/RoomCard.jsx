import { useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  overBudget = false, // shown but priced above what they said they can pay
  owner, // the owner's profile, when the room has one
  onMessage, // omitted on your own room, and on ownerless seed rooms
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [descOpen, setDescOpen] = useState(false); // closed on every card, top match included
  const toggleRow = useRef(null);
  const { room, total_score, factors } = ranked;
  const description = room.description?.trim();

  // Opening adds content above the buttons, and the page stays put, so you
  // read it from the top. Collapsing removes content above the buttons — with
  // a long description that would fling the card up off screen — so after a
  // collapse, scroll by however far the buttons moved to keep them under your
  // finger. Browsers that already anchor the scroll measure ~0 and do nothing.
  function toggle(setter, isOpen) {
    if (!isOpen) {
      setter(true);
      return;
    }
    const before = toggleRow.current?.getBoundingClientRect().top;
    flushSync(() => setter(false));
    const after = toggleRow.current?.getBoundingClientRect().top;
    if (before != null && after != null && Math.abs(after - before) > 1) {
      window.scrollBy(0, after - before);
    }
  }

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
          {/* These sort below every affordable room, but say so on the card —
              finding out only by opening the receipt is a nasty surprise. */}
          {overBudget && <p className="over-budget-tag">Over your budget</p>}
          {/* Only admins ever get inactive rooms back from a search, and only
              when they ask for them. Say so, so they're never mistaken for
              what everyone else sees. */}
          {room.active === false && (
            <p className="status-tag">Inactive · hidden from search</p>
          )}
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

      {/* Plain text only: React escapes it, and pre-line keeps the line
          breaks and "- " lists that listing posts are written in. */}
      {description && descOpen && <div className="room-desc">{description}</div>}

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

      {/* No description, no Description button — just "Why this score?". */}
      <div className="toggle-row" ref={toggleRow}>
        {description && (
          <button
            type="button"
            className="toggle"
            aria-expanded={descOpen}
            onClick={() => toggle(setDescOpen, descOpen)}
          >
            {descOpen ? "Hide description" : "Description"}
          </button>
        )}
        <button
          type="button"
          className="toggle"
          aria-expanded={open}
          onClick={() => toggle(setOpen, open)}
        >
          {open ? "Hide the breakdown" : "Why this score?"}
        </button>
      </div>
    </article>
  );
}
