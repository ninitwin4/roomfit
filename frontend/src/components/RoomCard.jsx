import { useState } from "react";

// One ramp, used for both the total score and each factor bar, so the color
// always means the same thing: how well this piece fits.
function rampColor(ratio) {
  if (ratio >= 0.75) return "var(--fit-high)";
  if (ratio >= 0.5) return "var(--fit-mid)";
  return "var(--fit-low)";
}

export default function RoomCard({ ranked, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const { room, total_score, factors } = ranked;

  return (
    <article className="card">
      <div className="card-top">
        <div>
          <h3 className="room-title">{room.title}</h3>
          <p className="room-meta">
            ${room.rent}/mo · {room.location}
          </p>
        </div>
        <div className="score">
          <span
            className="score-num"
            style={{ color: rampColor(total_score / 100) }}
          >
            {total_score}
          </span>
          <span className="score-label">fit</span>
        </div>
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
                    style={{
                      width: `${ratio * 100}%`,
                      background: rampColor(ratio),
                    }}
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
