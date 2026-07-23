import { useEffect, useState } from "react";
import PreferenceForm from "./components/PreferenceForm.jsx";
import RoomCard from "./components/RoomCard.jsx";
import Auth from "./components/Auth.jsx";
import { rankRooms } from "./api.js";
import { supabase, fetchRooms } from "./supabase.js";

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

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
      <header className="masthead">
        <h1 className="wordmark">roomfit</h1>
        <p className="tagline">
          Rooms ranked by how well they fit you — and the reason for every rank.
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

      {checkingAuth ? null : !session ? (
        <Auth />
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
                  <RoomCard key={r.room.id} ranked={r} defaultOpen={i === 0} />
                ))
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
