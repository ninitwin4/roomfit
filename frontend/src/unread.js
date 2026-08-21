// Unread state lives in localStorage rather than a read_at column.
//
// Why: a "mark as read" UPDATE policy scoped to recipient_id would also let the
// recipient rewrite the message body, because RLS is row-level, not
// column-level. Keeping messages immutable and tracking reads on the device
// avoids that entirely.
//
// Honest trade-off: unread state doesn't follow you across devices, and
// clearing site data marks everything unread again. The messages table already
// has a read_at column reserved, so upgrading later is a policy change rather
// than a migration.

const KEY = (threadKey) => `roomfit:lastRead:${threadKey}`;

export function markRead(threadKey) {
  try {
    localStorage.setItem(KEY(threadKey), new Date().toISOString());
  } catch {
    /* private browsing — unread just won't persist */
  }
}

export function isUnread(thread) {
  if (thread.lastFromMe) return false; // your own message is never unread
  try {
    const seen = localStorage.getItem(KEY(thread.key));
    return !seen || new Date(thread.last.created_at) > new Date(seen);
  } catch {
    return false;
  }
}

export const countUnread = (threads) => threads.filter(isUnread).length;
