import { useState } from "react";
import { supabase } from "../supabase.js";

// Where Supabase sends people after they click the reset link in their email.
// This origin must be listed under Authentication → URL Configuration →
// Redirect URLs in the Supabase dashboard, or the link bounces.
const RESET_REDIRECT = `${window.location.origin}/`;

export default function Auth() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  function go(next) {
    setMode(next);
    setMessage(null);
  }

  async function submit() {
    setBusy(true);
    setMessage(null);

    if (isForgot) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: RESET_REDIRECT,
      });
      setBusy(false);
      // Deliberately the same message whether or not the address exists —
      // otherwise this form becomes a way to discover who has an account.
      setMessage(
        error
          ? { tone: "error", text: error.message }
          : {
              tone: "info",
              text: "If that email has an account, a reset link is on its way. Check your spam folder too.",
            }
      );
      return;
    }

    const fn = isSignup ? supabase.auth.signUp : supabase.auth.signInWithPassword;
    const { data, error } = await fn.call(supabase.auth, { email, password });

    setBusy(false);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }
    // With email confirmation on, signUp returns a user but no session.
    if (isSignup && !data.session) {
      setMessage({
        tone: "info",
        text: "Check your email to confirm the account, then sign in.",
      });
    }
    // On success with a session, onAuthStateChange in App takes over.
  }

  const canSubmit = isForgot
    ? !!email && !busy
    : !!email && password.length >= 6 && !busy;

  return (
    <div className="panel">
      {isForgot && (
        <>
          <h2 className="form-title">Reset your password</h2>
          <p className="hint">
            Enter your email and we'll send you a link to set a new one.
          </p>
        </>
      )}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {!isForgot && (
        <div className="field">
          <label htmlFor="password">Password</label>
          <span className="hint">At least 6 characters.</span>
          <div className="password-input">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="peek"
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="submit"
        disabled={!canSubmit}
        onClick={submit}
      >
        {busy
          ? "Working…"
          : isForgot
          ? "Send reset link"
          : isSignup
          ? "Create account"
          : "Sign in"}
      </button>

      {message && (
        <p className={message.tone === "error" ? "auth-error" : "auth-info"}>
          {message.text}
        </p>
      )}

      {mode === "signin" && (
        <p className="auth-forgot">
          <button type="button" className="linkish" onClick={() => go("forgot")}>
            Forgot password
          </button>
        </p>
      )}

      <p className="auth-switch">
        {isForgot ? (
          <button type="button" className="linkish" onClick={() => go("signin")}>
            Back to sign in
          </button>
        ) : (
          <>
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="linkish"
              onClick={() => go(isSignup ? "signin" : "signup")}
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
