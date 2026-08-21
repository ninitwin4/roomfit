import { useState } from "react";
import { supabase } from "../supabase.js";

// Shown after someone follows the reset link from their email. At this point
// Supabase has already put them in a temporary recovery session, so updateUser
// is all that's needed — no token handling here.
export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="panel">
      <h2 className="form-title">Choose a new password</h2>

      <div className="field">
        <label htmlFor="new-password">New password</label>
        <span className="hint">At least 6 characters.</span>
        <div className="password-input">
          <input
            id="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="peek"
            aria-pressed={show}
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button
        type="button"
        className="submit"
        disabled={busy || password.length < 6}
        onClick={save}
      >
        {busy ? "Saving…" : "Save new password"}
      </button>
    </div>
  );
}
