import { useState } from "react";
import { supabase } from "../supabase.js";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const isSignup = mode === "signup";

  async function submit() {
    setBusy(true);
    setMessage(null);

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

  return (
    <div className="panel">
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

      <div className="field">
        <label htmlFor="password">Password</label>
        <span className="hint">At least 6 characters.</span>
        <input
          id="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="submit"
        disabled={busy || !email || password.length < 6}
        onClick={submit}
      >
        {busy ? "Working…" : isSignup ? "Create account" : "Sign in"}
      </button>

      {message && (
        <p className={message.tone === "error" ? "auth-error" : "auth-info"}>
          {message.text}
        </p>
      )}

      <p className="auth-switch">
        {isSignup ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(isSignup ? "signin" : "signup");
            setMessage(null);
          }}
        >
          {isSignup ? "Sign in" : "Create one"}
        </button>
      </p>
    </div>
  );
}
