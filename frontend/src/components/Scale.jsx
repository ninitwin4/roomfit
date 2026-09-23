// A 1–5 slider with a value bubble that rides above the thumb.
// Shared by the preference form and the add/edit/claim room form.
//
// `unset` draws it as "no answer yet" rather than as the number it happens to
// be sitting on — a range input always has a value, so the claim form needs a
// way to show that nobody has chosen one. `onInteract` fires on any touch of
// the control, because tapping the thumb where it already sits is a real
// answer but changes nothing and so fires no change event.
export default function Scale({
  value,
  low,
  high,
  labelId,
  onChange,
  unset = false,
  onInteract,
}) {
  const pct = ((value - 1) / 4) * 100; // 0..100 across the 1–5 range
  return (
    <div
      className={unset ? "range-wrap is-unset" : "range-wrap"}
      style={{ "--pct": pct }}
    >
      <output className="range-bubble">{unset ? "—" : value}</output>
      <input
        type="range"
        className="range"
        min="1"
        max="5"
        step="1"
        value={value}
        aria-labelledby={labelId}
        aria-valuetext={unset ? "not set yet" : `${value} of 5`}
        onPointerDown={onInteract}
        onKeyDown={onInteract}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="scale-ends">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
