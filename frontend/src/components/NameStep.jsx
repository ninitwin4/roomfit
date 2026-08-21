import { useState } from "react";
import { saveMyProfile } from "../supabase.js";

// Second step of signing up. Also catches accounts created before profiles
// existed — they get asked once, on their next visit, and never again.
export default function NameStep({ onDone }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const valid = first.trim() && last.trim();

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      onDone(
        await saveMyProfile({
          first_name: first.trim(),
          last_name: last.trim(),
        })
      );
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2 className="form-title name-step-title">Enter your name</h2>

      <div className="field">
        <label htmlFor="first-name">First name</label>
        <input
          id="first-name"
          type="text"
          autoComplete="given-name"
          autoFocus
          value={first}
          onChange={(e) => setFirst(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="last-name">Last name</label>
        <input
          id="last-name"
          type="text"
          autoComplete="family-name"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !busy) finish();
          }}
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button
        type="button"
        className="submit"
        disabled={!valid || busy}
        onClick={finish}
      >
        {busy ? "Saving…" : "Finish"}
      </button>
    </div>
  );
}
