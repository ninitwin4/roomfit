import { useEffect, useState } from "react";
import PreferenceForm from "./components/PreferenceForm.jsx";
import RoomCard from "./components/RoomCard.jsx";
import Auth from "./components/Auth.jsx";
import MyListings from "./components/MyListings.jsx";
import SavedRooms, { PREFS_KEY } from "./components/SavedRooms.jsx";
import ResetPassword from "./components/ResetPassword.jsx";
import NameStep from "./components/NameStep.jsx";
import ProfileEditor from "./components/ProfileEditor.jsx";
import Avatar from "./components/Avatar.jsx";
import Messages from "./components/Messages.jsx";
import InterestSheet from "./components/InterestSheet.jsx";
import SharedRoom from "./components/SharedRoom.jsx";
import { rankRooms, warmUp } from "./api.js";
import {
  supabase,
  fetchRooms,
  fetchFavouriteIds,
  fetchMyInterestIds,
  awaitingHost,
  toggleFavourite,
  fetchMyProfile,
  fetchProfilesByIds,
  displayName,
  CLAIM_PARAM,
  SHARED_PATH,
  recordVisit,
} from "./supabase.js";

// A claim link is /?claim=<token>. The token has to survive sign-up and the
// name step, so it's kept in localStorage until the claim is accepted or
// cancelled, and taken out of the address bar straight away.
const CLAIM_KEY = "roomfit:claim";

function readClaimToken() {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(CLAIM_PARAM);
    if (fromUrl) {
      localStorage.setItem(CLAIM_KEY, fromUrl);
      url.searchParams.delete(CLAIM_PARAM);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return fromUrl;
    }
    return localStorage.getItem(CLAIM_KEY);
  } catch {
    // private browsing: fall back to whatever the address bar has
    return new URLSearchParams(window.location.search).get(CLAIM_PARAM);
  }
}

function clearClaimToken() {
  try {
    localStorage.removeItem(CLAIM_KEY);
  } catch {
    /* nothing stored, nothing to clear */
  }
}

// A link can open the app on a tab: /?view=listings is the landing page's
// "List your room". Signed out, the tab waits behind sign-up, because the app
// stays on one page throughout. Read once, when this file loads — StrictMode
// runs state initialisers twice, and the second run would find the address bar
// already tidied — then taken out of it, so a reload starts on Find as usual.
const VIEWS = ["find", "saved", "messages", "listings"];

function readStartView() {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("view");
    if (fromUrl === null) return "find";
    url.searchParams.delete("view");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    return VIEWS.includes(fromUrl) ? fromUrl : "find";
  } catch {
    return "find";
  }
}

const START_VIEW = readStartView();

// A shared room is /r/<id> (supabase/25_shared_rooms.sql). The address stays
// as it is through sign-up and the name step, so the room is still there
// afterwards; leaving the room takes it out.
const SHARED_ROOM_ID = window.location.pathname.match(SHARED_PATH)?.[1] ?? null;

export default function App() {
  const [session, setSession] = useState(null);
  const [claimToken, setClaimToken] = useState(readClaimToken);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState(START_VIEW); // "find" | "saved" | "messages" | "listings"
  const [sharedId, setSharedId] = useState(SHARED_ROOM_ID); // the /r/<id> room on screen
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [interestIds, setInterestIds] = useState(() => new Set());
  const [interestRoom, setInterestRoom] = useState(null); // the open "I'm interested" sheet
  const [recovering, setRecovering] = useState(false);
  // undefined = not looked up yet, null = no profile row, object = loaded
  const [profile, setProfile] = useState(undefined);
  // true when the profiles table can't be read at all (e.g. migration not run).
  // Kept separate from `null` so a lookup failure never traps someone on the
  // name step with no way past it.
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [owners, setOwners] = useState(new Map()); // owner_id -> profile
  const [openThread, setOpenThread] = useState(null);
  const [unread, setUnread] = useState(0);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [lastPrefs, setLastPrefs] = useState(null); // to flag over-budget results
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

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Arriving from a reset link: Supabase puts the user in a temporary
      // recovery session, so we must intercept before the normal signed-in
      // view renders and ask them to set a new password.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
      if (!s) {
        setData(null); // clear results on sign out
        setSavedIds(new Set());
        setInterestIds(new Set());
      }
      // A pending claim belongs to whoever opened the link, not to the next
      // person to sign in on this device.
      if (event === "SIGNED_OUT") {
        clearClaimToken();
        setClaimToken(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Count today as a day this person used the app: once when it opens, and
  // again when a tab left open comes back into view on a later day.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let counted = null;
    function visit() {
      const today = new Date().toDateString();
      if (document.visibilityState !== "visible" || today === counted) return;
      counted = today;
      recordVisit();
    }
    visit();
    document.addEventListener("visibilitychange", visit);
    return () => document.removeEventListener("visibilitychange", visit);
  }, [userId]);

  // Which rooms this user has saved. Fails soft: saving is an enhancement, and
  // a problem loading it should never block matching.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchFavouriteIds()
      .then((ids) => alive && setSavedIds(ids))
      .catch(() => {});
    // Which rooms they've already said "I'm interested" to, so the card can say
    // so. Fails soft the same way: worst case, the button shows again and the
    // database answers "already".
    fetchMyInterestIds()
      .then((ids) => alive && setInterestIds(ids))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session]);

  // The profile carries the display name. Fails soft to `null` so that if the
  // profiles table isn't there yet, the app still works and simply falls back
  // to showing the email — it must never gate someone out of the app.
  useEffect(() => {
    if (!session) {
      setProfile(undefined);
      return;
    }
    let alive = true;
    fetchMyProfile()
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setProfileUnavailable(false);
      })
      .catch(() => {
        if (!alive) return;
        setProfile(null);
        setProfileUnavailable(true);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  // Tapping the wordmark returns to the start of the match flow — the same
  // place "Change preferences" goes, so the logo behaves like a home button.
  function goHome() {
    go("find");
    setData(null);
    setError(null);
  }

  // Every way out of a shared room goes through here, so the room and its
  // address go together.
  function leaveSharedRoom() {
    if (!sharedId) return;
    setSharedId(null);
    window.history.replaceState(null, "", "/" + window.location.search + window.location.hash);
  }

  function go(next) {
    leaveSharedRoom();
    setView(next);
  }

  // "Message" on a room card is the one cross-view jump: hand the thread to
  // the Messages tab and switch to it.
  function handleMessage(room) {
    setOpenThread({ roomId: room.id, otherId: room.owner_id, room });
    go("messages");
  }

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

  async function handleSubmit(prefs, { includeInactive = false } = {}) {
    setLoading(true);
    setError(null);
    // Remember the last search so the Saved tab can score against it — and so
    // the form isn't back to defaults next time you open the app.
    setLastPrefs(prefs);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private browsing / quota — not worth failing the match over */
    }
    try {
      const rooms = await fetchRooms({ includeInactive });
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

  // Owner name + avatar for the rooms currently on screen. Fails soft — a
  // missing profile just renders as "Someone".
  useEffect(() => {
    const ids = (data?.results ?? [])
      .map((r) => r.room.owner_id)
      .filter(Boolean);
    if (ids.length === 0) return;
    let alive = true;
    fetchProfilesByIds(ids)
      .then((m) => alive && setOwners(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [data]);

  const results = data?.results ?? [];
  const name = displayName(profile);
  // Ask for a name only once we know for certain there isn't one on file.
  const needsName = !!session && profile === null && !profileUnavailable;
  // Shows admin controls. It's presentation only — every admin action is
  // checked again in the database.
  const isAdmin = profile?.role === "admin";

  // Arriving through a claim link: once signed in (and past the name step),
  // go straight to the Listings tab, where the claim screen is waiting.
  useEffect(() => {
    if (claimToken && session && !needsName) setView("listings");
  }, [claimToken, session, needsName]);

  function finishClaim() {
    clearClaimToken();
    setClaimToken(null);
  }

  return (
    <main className="app">
      {interestRoom && (
        <InterestSheet
          room={interestRoom}
          onClose={() => setInterestRoom(null)}
          onSent={(roomId) =>
            setInterestIds((prev) => new Set(prev).add(String(roomId)))
          }
        />
      )}

      {editingProfile && (
        <ProfileEditor
          profile={profile}
          onSave={(p) => {
            setProfile(p);
            setEditingProfile(false);
          }}
          onClose={() => setEditingProfile(false)}
        />
      )}

      {/* A shared room is its own pitch, so it gets the small masthead. */}
      {!checkingAuth && !session && !sharedId ? (
        <header className="hero">
          <p className="hero-eyebrow">roomfit</p>
          {/* The eyebrow above already says roomfit, so the headline is free to
              say what the app does. The italic is the point: EB Garamond's is
              calligraphic, and it lands on the word the product turns on. */}
          <h1 className="hero-title">
            Find a room that <em>fits</em>.
          </h1>
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
              See exactly <strong>why</strong> a room ranked where it did,{" "}
              <span className="nobreak">not just a number.</span>
            </li>
            {/* The hero shows for every signed-out visitor, a lister opening a
                claim link included — so one bullet is theirs. It promises only
                what the engine does: ranking is seeker → room, so a lister
                never gets ranked candidates, just people who already fit. */}
            <li className="value-prop">
              Listing a room? Anyone who messages you has{" "}
              <strong>already been scored</strong> against it.
            </li>
          </ul>
          <p className="scroll-cue">Sign in to start ↓</p>
        </header>
      ) : (
        <header className="masthead">
          <h1 className="wordmark">
            <button
              type="button"
              className="wordmark-btn"
              onClick={goHome}
              aria-label="roomfit — back to search"
            >
              roomfit
            </button>
          </h1>
          <p className="tagline">
            Rooms ranked by how well they fit you — and the reason for every
            rank.
          </p>
          {session && (
            <p className="signed-in">
              {name ? (
                <button
                  type="button"
                  className="who"
                  onClick={() => setEditingProfile(true)}
                >
                  <Avatar profile={profile} size={26} />
                  <span className="who-name">{name}</span>
                </button>
              ) : (
                session.user.email
              )}
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

      {checkingAuth ? null : recovering ? (
        <ResetPassword onDone={() => setRecovering(false)} />
      ) : !session ? (
        sharedId ? (
          <>
            <SharedRoom id={sharedId} onLeave={leaveSharedRoom} />
            <Auth signupFirst />
          </>
        ) : (
          <Auth claiming={!!claimToken} />
        )
      ) : needsName ? (
        <NameStep onDone={(p) => setProfile(p)} />
      ) : (
        <>
          <nav className="tabs">
            <button
              type="button"
              className={!sharedId && view === "find" ? "tab active" : "tab"}
              onClick={() => go("find")}
            >
              Find
            </button>
            <button
              type="button"
              className={!sharedId && view === "saved" ? "tab active" : "tab"}
              onClick={() => go("saved")}
            >
              Saved{savedIds.size > 0 ? ` (${savedIds.size})` : ""}
            </button>
            <button
              type="button"
              className={!sharedId && view === "messages" ? "tab active" : "tab"}
              onClick={() => go("messages")}
            >
              Inbox{unread > 0 ? ` (${unread})` : ""}
            </button>
            <button
              type="button"
              className={!sharedId && view === "listings" ? "tab active" : "tab"}
              onClick={() => go("listings")}
            >
              Listings
            </button>
          </nav>

          {sharedId ? (
            <SharedRoom
              id={sharedId}
              me={session.user.id}
              onMessage={handleMessage}
              onLeave={() => go("find")}
            />
          ) : view === "messages" ? (
            <Messages
              me={session.user.id}
              openThread={openThread}
              onConsumeOpen={() => setOpenThread(null)}
              onUnreadChange={setUnread}
            />
          ) : view === "saved" ? (
            <SavedRooms savedIds={savedIds} onToggleSave={handleToggleSave} />
          ) : view === "listings" ? (
            <MyListings
              isAdmin={isAdmin}
              claimToken={claimToken}
              onClaimDone={finishClaim}
            />
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
                <PreferenceForm
                  onSubmit={handleSubmit}
                  loading={loading}
                  isAdmin={isAdmin}
                />
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
                    overBudget={
                      !!lastPrefs && r.room.rent > lastPrefs.budget_max
                    }
                    owner={owners.get(r.room.owner_id)}
                    onMessage={
                      r.room.owner_id &&
                      r.room.owner_id !== session?.user?.id &&
                      !awaitingHost(r.room)
                        ? handleMessage
                        : undefined
                    }
                    onInterested={
                      awaitingHost(r.room) && r.room.owner_id !== session?.user?.id
                        ? setInterestRoom
                        : undefined
                    }
                    interestSent={interestIds.has(String(r.room.id))}
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
