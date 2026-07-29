import { useEffect, useState } from "react";
import { fetchLocations } from "../supabase.js";
import Scale from "./Scale.jsx";

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

  const [locations, setLocations] = useState([]);
  const [locState, setLocState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let alive = true;
    fetchLocations()
      .then((list) => {
        if (!alive) return;
        setLocations(list);
        setLocState("ready");
        // keep the default valid: if "Mission" isn't in the list, use the first
        setPrefs((p) =>
          list.includes(p.location_pref)
            ? p
            : { ...p, location_pref: list[0] ?? p.location_pref }
        );
      })
      .catch(() => alive && setLocState("error"));
    return () => {
      alive = false;
    };
  }, []);

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
            type="text"
            inputMode="numeric"
            value={prefs.budget_max}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              set("budget_max", digits === "" ? 0 : parseInt(digits, 10));
            }}
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
        {locState === "error" ? (
          <>
            <span className="hint">Couldn't load areas — type one instead.</span>
            <input
              id="location"
              type="text"
              placeholder="Mission"
              value={prefs.location_pref}
              onChange={(e) => set("location_pref", e.target.value)}
            />
          </>
        ) : (
          <select
            id="location"
            value={prefs.location_pref}
            disabled={locState === "loading"}
            onChange={(e) => set("location_pref", e.target.value)}
          >
            {locState === "loading" ? (
              <option>Loading areas…</option>
            ) : (
              locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      <div className="field">
        <span className="field-label" id="tidy-label">
          How tidy you keep a place
        </span>
        <Scale
          value={prefs.cleanliness_pref}
          low="Relaxed"
          high="Spotless"
          labelId="tidy-label"
          onChange={(v) => set("cleanliness_pref", v)}
        />
      </div>

      <div className="field">
        <span className="field-label" id="social-label">
          How social you want the home to be
        </span>
        <Scale
          value={prefs.social_pref}
          low="Keep to myself"
          high="Very social"
          labelId="social-label"
          onChange={(v) => set("social_pref", v)}
        />
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
