import { useEffect, useRef, useState } from "react";
import {
  fetchInbox,
  fetchThread,
  sendMessage,
  fetchProfilesByIds,
  displayName,
} from "../supabase.js";
import { markRead, isUnread } from "../unread.js";
import Avatar from "./Avatar.jsx";

const firstName = (p) => p?.first_name?.trim() || displayName(p) || "Someone";

function coverOf(room) {
  return room?.photos?.[0] ?? room?.photo_url ?? null;
}

function when(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Owns inbox ↔ thread internally, the same way MyListings owns list ↔ form, so
// App only ever knows about one more tab.
export default function Messages({ me, openThread, onConsumeOpen, onUnreadChange }) {
  const [threads, setThreads] = useState(null);
  const [people, setPeople] = useState(new Map());
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null); // { roomId, otherId, room }

  async function loadInbox() {
    setError(null);
    try {
      const list = await fetchInbox();
      setThreads(list);
      setPeople(await fetchProfilesByIds(list.map((t) => t.otherId)));
      onUnreadChange?.(list.filter(isUnread).length);
    } catch (err) {
      setError(err.message);
      setThreads([]);
    }
  }

  useEffect(() => {
    loadInbox();
  }, []);

  // "Message the owner" from a room card lands here.
  useEffect(() => {
    if (!openThread) return;
    setActive(openThread);
    onConsumeOpen?.();
  }, [openThread]);

  if (active) {
    return (
      <Thread
        me={me}
        {...active}
        person={people.get(active.otherId)}
        onBack={() => {
          setActive(null);
          loadInbox();
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="notice">
        <p>{error}</p>
        <button type="button" className="linkish" onClick={loadInbox}>
          Try again
        </button>
      </div>
    );
  }

  if (threads === null) {
    return <p className="filtered-note">Loading your messages…</p>;
  }

  if (threads.length === 0) {
    return (
      <div className="notice">
        <p>
          No messages yet. Open a match and tap <strong>Message</strong> to ask
          the person about their room.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="results-head">
        <h2 className="results-count">Messages</h2>
        <button type="button" className="linkish" onClick={loadInbox}>
          Refresh
        </button>
      </div>

      <ul className="thread-list">
        {threads.map((t) => {
          const person = people.get(t.otherId);
          const unread = isUnread(t);
          return (
            <li key={t.key}>
              <button
                type="button"
                className={unread ? "thread-row unread" : "thread-row"}
                onClick={() =>
                  setActive({ roomId: t.roomId, otherId: t.otherId, room: t.room })
                }
              >
                <Avatar profile={person} size={44} />
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-name">{firstName(person)}</span>
                    <span className="thread-time">{when(t.last.created_at)}</span>
                  </span>
                  <span className="thread-room">{t.room?.title ?? "a room"}</span>
                  <span className="thread-snippet">
                    {t.lastFromMe && "You: "}
                    {t.last.body}
                  </span>
                </span>
                {unread && <span className="thread-dot" aria-label="Unread" />}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Thread({ me, roomId, otherId, room, person, onBack }) {
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  async function load() {
    try {
      const list = await fetchThread(roomId, otherId);
      setMessages(list);
      markRead(`${roomId}:${otherId}`);
    } catch (err) {
      setError(err.message);
      setMessages([]);
    }
  }

  useEffect(() => {
    load();
  }, [roomId, otherId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage({ roomId, recipientId: otherId, body });
      setMessages((m) => [...(m ?? []), sent]);
      setDraft("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="thread-head">
        <button type="button" className="linkish" onClick={onBack}>
          ← Messages
        </button>
      </div>

      <div className="card thread-about">
        {coverOf(room) && (
          <img className="thread-about-photo" src={coverOf(room)} alt="" />
        )}
        <div>
          <p className="thread-about-name">
            <Avatar profile={person} size={22} /> {firstName(person)}
          </p>
          <p className="room-meta">{room?.title ?? "a room"}</p>
        </div>
      </div>

      {messages === null ? (
        <p className="filtered-note">Loading…</p>
      ) : (
        <div className="bubbles">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.sender_id === me ? "bubble mine" : "bubble"}
            >
              <p>{m.body}</p>
              <span className="bubble-time">{when(m.created_at)}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {error && <p className="auth-error">{error}</p>}

      <div className="composer">
        <textarea
          rows={2}
          placeholder="Write a message…"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!sending) send();
            }
          }}
        />
        <button
          type="button"
          className="submit composer-send"
          disabled={sending || !draft.trim()}
          onClick={send}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </>
  );
}
