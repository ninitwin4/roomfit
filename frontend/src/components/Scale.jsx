// A 1–5 slider with a value bubble that rides above the thumb.
// Shared by the preference form and the add/edit room form.
export default function Scale({ value, low, high, labelId, onChange }) {
  const pct = ((value - 1) / 4) * 100; // 0..100 across the 1–5 range
  return (
    <div className="range-wrap" style={{ "--pct": pct }}>
      <output className="range-bubble">{value}</output>
      <input
        type="range"
        className="range"
        min="1"
        max="5"
        step="1"
        value={value}
        aria-labelledby={labelId}
        aria-valuetext={`${value} of 5`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="scale-ends">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
