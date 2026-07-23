import { useState } from "react";

const SCALE_ENDS = {
  cleanliness_pref: ["Relaxed", "Spotless"],
  social_pref: ["Keep to myself", "Very social"],
};

function Scale({ name, value, onChange }) {
  const [low, high] = SCALE_ENDS[name];
  return (
    <>
      <div className="scale" role="group">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(name, n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="scale-ends">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </>
  );
}

export default function PreferenceForm({ onSubmit, loading }) {
  const [prefs, setPrefs] = useState({
    budget_max: 1000,
    location_pref: "Mission",
    cleanliness_pref: 4,
    social_pref: 3,
    sleep_pref: "flexible",
    needs_pets: false,
    smoking_ok: false,
  });

  const set = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));

  return (
    <div className="panel">
      <div className="field">
        <label htmlFor="budget">Monthly budget</label>
        <span className="hint">Rooms above this are ruled out entirely.</span>
        <div className="budget-input">
          <span className="budget-prefix" aria-hidden="true">
            $
          </span>
          <input
            id="budget"
            type="number"
            inputMode="numeric"
            min="0"
            step="50"
            value={prefs.budget_max}
            onChange={(e) => set("budget_max", Number(e.target.value))}
          />
          <div className="stepper">
            <button
              type="button"
              aria-label="Increase budget by 50"
              onClick={() => set("budget_max", prefs.budget_max + 50)}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="Decrease budget by 50"
              onClick={() =>
                set("budget_max", Math.max(0, prefs.budget_max - 50))
              }
            >
              ▼
            </button>
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="location">Where you want to be</label>
        <input
          id="location"
          type="text"
          placeholder="Mission"
          value={prefs.location_pref}
          onChange={(e) => set("location_pref", e.target.value)}
        />
      </div>

      <div className="field">
        <span className="field-label">How tidy you keep a place</span>
        <Scale
          name="cleanliness_pref"
          value={prefs.cleanliness_pref}
          onChange={set}
        />
      </div>

      <div className="field">
        <span className="field-label">How social you want the home to be</span>
        <Scale name="social_pref" value={prefs.social_pref} onChange={set} />
      </div>

      <div className="field">
        <label htmlFor="sleep">Your hours</label>
        <select
          id="sleep"
          value={prefs.sleep_pref}
          onChange={(e) => set("sleep_pref", e.target.value)}
        >
          <option value="early">Early riser</option>
          <option value="late">Night owl</option>
          <option value="flexible">Flexible</option>
        </select>
      </div>

      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.needs_pets}
            onChange={(e) => set("needs_pets", e.target.checked)}
          />
          I'm bringing a pet
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.smoking_ok}
            onChange={(e) => set("smoking_ok", e.target.checked)}
          />
          I'm fine with a home where people smoke
        </label>
      </div>

      <button
        type="button"
        className="submit"
        disabled={loading}
        onClick={() => onSubmit(prefs)}
      >
        {loading ? "Ranking rooms…" : "Find my fit"}
      </button>
    </div>
  );
}
