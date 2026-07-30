import { useState } from "react";

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

export default function RoomCard({ ranked, defaultOpen = false, hero = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const { room, total_score, factors } = ranked;

  return (
    <article className={hero ? "card card-hero" : "card"}>
      {/* alt="" on purpose: the title sits directly below, so the image is
          decorative and a real alt would announce the room twice. */}
      {room.photo_url ? (
        <img className="room-photo" src={room.photo_url} alt="" loading="lazy" />
      ) : (
        <div className="room-photo room-photo-empty">No photo yet</div>
      )}

      <div className="card-top">
        <div>
          <h3 className="room-title">{room.title}</h3>
          <p className="room-meta">
            ${room.rent}/mo · {room.location}
          </p>
        </div>
        <Gauge score={total_score} hero={hero} />
      </div>

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
