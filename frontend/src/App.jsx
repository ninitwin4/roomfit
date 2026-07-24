import { useEffect, useState } from "react";
import PreferenceForm from "./components/PreferenceForm.jsx";
import RoomCard from "./components/RoomCard.jsx";
import Auth from "./components/Auth.jsx";
import MyListings from "./components/MyListings.jsx";
import { rankRooms } from "./api.js";
import { supabase, fetchRooms } from "./supabase.js";

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState("find"); // "find" | "listings"

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingAuth(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setData(null); // clear results on sign out
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(prefs) {
    setLoading(true);
    setError(null);
    try {
      const rooms = await fetchRooms();
      setData(await rankRooms(prefs, rooms));
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Can't reach the ranking service. Check that it's running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  const results = data?.results ?? [];

  return (
    <main className="app">
      {!checkingAuth && !session ? (
        <header className="hero">
          <p className="hero-eyebrow">roomfit</p>
          <h1 className="hero-title">Welcome to roomfit</h1>
          <p className="hero-lede">
            Rooms ranked by how well they actually fit you — with the receipt to
            prove it.
          </p>
          <ul className="value-props">
            <li className="value-prop">
              Every match comes with a <strong>receipt</strong> — the five
              factors behind its score.
            </li>
            <li className="value-prop">
              See exactly <strong>why</strong> a room ranked where it did, not
              just a number.
            </li>
            <li className="value-prop">
              Set your budget and must-haves; we rule out dealbreakers and rank
              the rest.
            </li>
          </ul>
          <p className="scroll-cue">Sign in to start ↓</p>
        </header>
      ) : (
        <header className="masthead">
          <h1 className="wordmark">roomfit</h1>
          <p className="tagline">
            Rooms ranked by how well they fit you — and the reason for every
            rank.
          </p>
          {session && (
            <p className="signed-in">
              {session.user.email}
              {" · "}
              <button
                type="button"
                className="linkish"
                onClick={() => supabase.auth.signOut()}
              >
                Sign out
              </button>
            </p>
          )}
        </header>
      )}

      {checkingAuth ? null : !session ? (
        <Auth />
      ) : (
        <>
          <nav className="tabs">
            <button
              type="button"
              className={view === "find" ? "tab active" : "tab"}
              onClick={() => setView("find")}
            >
              Find a room
            </button>
            <button
              type="button"
              className={view === "listings" ? "tab active" : "tab"}
              onClick={() => setView("listings")}
            >
              My listings
            </button>
          </nav>

          {view === "listings" ? (
            <MyListings />
          ) : (
            <>
              {!data && !error && (
                <PreferenceForm onSubmit={handleSubmit} loading={loading} />
              )}

          {error && (
            <div className="notice">
              <p>{error}</p>
              <button
                type="button"
                className="linkish"
                onClick={() => setError(null)}
              >
                Try again
              </button>
            </div>
          )}

          {data && !error && (
            <>
              <div className="results-head">
                <h2 className="results-count">
                  {results.length} {results.length === 1 ? "room" : "rooms"} fit
                </h2>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setData(null)}
                >
                  Change preferences
                </button>
              </div>

              {data.filtered_out > 0 && (
                <p className="filtered-note">
                  {data.filtered_out} ruled out on budget, pets, or smoking.
                </p>
              )}

              {results.length === 0 ? (
                <div className="notice">
                  <p>
                    Nothing cleared your must-haves. Raising the budget usually
                    opens the most doors.
                  </p>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setData(null)}
                  >
                    Change preferences
                  </button>
                </div>
              ) : (
                results.map((r, i) => (
                  <RoomCard
                    key={r.room.id}
                    ranked={r}
                    defaultOpen={i === 0}
                    hero={i === 0}
                  />
                ))
              )}
            </>
          )}
            </>
          )}
        </>
      )}
    </main>
  );
}
