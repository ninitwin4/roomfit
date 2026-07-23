# Kickoff prompt for the new Claude Code chat

Paste the block below as your first message, after dropping the repo files in
place. Delete this file from the repo afterwards if you like — it's a note to
self, not part of the app.

---

```
This is roomfit — a room-matching web app I'm shipping by Aug 3. Read
CLAUDE.md first; it has the stack, the locked decisions, and the guardrails.
Then read SESSION_A.md, which is the runbook for where I am right now.

Context: the planning and the Week 1 code are done and in this repo. The
backend ranking engine, the React UI, the Supabase schema, and the deploy
config are all written but NOT yet deployed — there's no live URL and no
Supabase project yet.

I have ~3-5 hrs a week for this and it's not my main project, so keep changes
small and tell me when something isn't worth the time.

First task: walk me through SESSION_A.md step by step. Stop after each step so
I can run it and confirm before we move on. Start with step 1 — I'll create the
Supabase project and paste the SQL.

Before we start, verify the code actually matches what CLAUDE.md claims: run
the backend, hit /health, and confirm the frontend builds.
```

---

## Follow-up prompts for later sessions

**Session B — user listings**

```
Session A is done and roomfit is live at <URL>. Read CLAUDE.md.

Next: the "add your room" form. Requirements:
- Writes to the rooms table with owner_id = auth.uid()
- Same field set as the Room schema — reuse the PreferenceForm input styles
- A "my listings" view where I can edit or delete only my own rooms
- Seed rooms (owner_id null) stay read-only for everyone

Keep it to the existing component patterns. No new dependencies.
```

**When something breaks**

```
Read CLAUDE.md. <paste the error>. Don't refactor around it — find the
smallest fix and tell me what caused it.
```

**Scope check, when time gets tight**

```
Read CLAUDE.md. I have <N> hours left before Aug 3 and these are still open:
<list>. What's the smallest set of work that still hits the definition of done?
Tell me what to cut.
```
