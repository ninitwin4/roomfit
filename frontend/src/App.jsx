import { useEffect, useState } from "react";
import PreferenceForm from "./components/PreferenceForm.jsx";
import RoomCard from "./components/RoomCard.jsx";
import Auth from "./components/Auth.jsx";
import MyListings from "./components/MyListings.jsx";
import SavedRooms, { PREFS_KEY } from "./components/SavedRooms.jsx";
import { rankRooms, warmUp } from "./api.js";
import {
  supabase,
  fetchRooms,
  fetchFavouriteIds,
  toggleFavourite,
} from "./supabase.js";

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState("find"); // "find" | "saved" | "listings"
  const [savedIds, setSavedIds] = useState(() => new Set());

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null);

  // A match is ~140ms warm. If it's taking seconds, the free-tier backend is
  // booting — say so rather than leaving someone watching a silent spinner.
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    // Wake the ranking service now, so it's ready by the time anyone submits.
    warmUp();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingAuth(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setData(null); // clear results on sign out
        setSavedIds(new Set());
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Which rooms this user has saved. Fails soft: saving is an enhancement, and
  // a problem loading it should never block matching.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchFavouriteIds()
      .then((ids) => alive && setSavedIds(ids))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session]);

  // Optimistic: flip the heart immediately, roll back only if the write fails.
  async function handleToggleSave(roomId, on) {
    const key = String(roomId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      on ? next.add(key) : next.delete(key);
      return next;
    });
    try {
      await toggleFavourite(roomId, on);
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        on ? next.delete(key) : next.add(key);
        return next;
      });
    }
  }

  async function handleSubmit(prefs) {
    setLoading(true);
    setError(null);
    // Remember the last search so the Saved tab can score against it — and so
    // the form isn't back to defaults next time you open the app.
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private browsing / quota — not worth failing the match over */
    }
    try {
      const rooms = await fetchRooms();
      const ranked = await rankRooms(prefs, rooms);

      // The backend echoes back only the fields its scoring model declares, so
      // display-only columns (photo_url) are dropped in transit. Merge them
      // back from the Supabase rows we already have.
      //
      // Order matters: the backend's copy wins on the five scored fields, so a
      // card can never disagree with its own receipt. Keys are stringified
      // because a bigint id may arrive as a string from PostgREST and a number
      // from JSON — a mismatch would silently no-op the merge.
      const byId = new Map(rooms.map((r) => [String(r.id), r]));
      setData({
        ...ranked,
        results: ranked.results.map((r) => ({
          ...r,
          room: { ...byId.get(String(r.room.id)), ...r.room },
        })),
      });
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
              className={view === "saved" ? "tab active" : "tab"}
              onClick={() => setView("saved")}
            >
              Saved{savedIds.size > 0 ? ` (${savedIds.size})` : ""}
            </button>
            <button
              type="button"
              className={view === "listings" ? "tab active" : "tab"}
              onClick={() => setView("listings")}
            >
              My listings
            </button>
          </nav>

          {view === "saved" ? (
            <SavedRooms savedIds={savedIds} onToggleSave={handleToggleSave} />
          ) : view === "listings" ? (
            <MyListings />
          ) : (
            <>
              {loading && (
                <div className="loading" role="status" aria-live="polite">
                  <div className="spinner" aria-hidden="true" />
                  <p className="loading-title">Finding your fit…</p>
                  <p className="loading-sub">
                    {slow
                      ? "Waking the ranking service — the first match after a quiet spell can take up to 30 seconds."
                      : "Ranking rooms by how well they match you."}
                  </p>
                </div>
              )}

              {!loading && !data && !error && (
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

          {!loading && data && !error && (
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
                    saved={savedIds.has(String(r.room.id))}
                    // no heart on your own listing — you can't save yourself
                    onToggleSave={
                      r.room.owner_id && r.room.owner_id === session?.user?.id
                        ? undefined
                        : handleToggleSave
                    }
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
