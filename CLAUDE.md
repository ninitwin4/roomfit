# CLAUDE.md — roomfit

Read this first, every session.

## What this is

A mobile-responsive web app that matches renters to rooms and shows **why**
each room ranked where it did. Built solo as a 30-day challenge project.

**Target: finished and demoed by Aug 3, 2026.**
**Time budget: ~3–5 focused hrs/week.** This is a secondary project. When
something threatens the deadline, cut scope — never add hours.

## Definition of done

A live URL where at least 3 real people can sign up, add a room listing, set
preferences, and see ranked matches with per-factor explanations.

## Stack

- **Frontend:** React + Vite, mobile-first, plain CSS (no framework)
- **Backend:** Python / FastAPI — stateless ranking service
- **Auth + DB:** Supabase (Postgres + email/password auth, RLS enforced)
- **Deploy:** frontend → Vercel, backend → Render

## Architecture rule (do not break)

The backend **never touches the database.** The frontend holds the Supabase
session, reads rooms, and posts `{ preferences, rooms }` to `/rank`. The
backend scores and explains — no credentials, no user data, nothing to migrate.

If `rooms` is omitted from the request, `/rank` falls back to
`backend/seed_rooms.json` so curl and local dev keep working.

## Locked decisions

Don't relitigate these without being asked:

- **Web app, not native.**
- **One core loop:** set preferences → ranked rooms → why each matched.
- **Matching is asymmetric:** seeker → room (person to listing), not person to person.
- **Ranking is deterministic.** No LLM in the scoring path.
- **5 scored factors**, 20 pts each → 0–100: budget fit, location, cleanliness,
  social level, sleep schedule.
- **3 hard filters** that drop a room entirely: over budget, pets needed but not
  allowed, smoking home when the seeker isn't OK with it.
- **Budget scoring is cheaper-is-better** (more budget left over). This was a
  deliberate flip from "closer to the ceiling" — it's easier to explain to
  testers. One-line revert: `CHEAPER_IS_BETTER` in `backend/ranking.py`.
- **Single role.** Every user both sets preferences and can post a listing. No
  seeker/lister split.
- **Hybrid listings.** 12 seed rooms (`owner_id` null) so the app is never
  empty, plus user-submitted rooms on top. Same schema for both.
- **The fit receipt is the product.** Every result shows its per-factor
  breakdown with a plain-language reason. Don't reduce it to a single number.

## Stretch goals — NOT commitments

Only touch these if everything above is done and there's time left:

- LLM-written match explanations
- Roommate-takeover feature

## Guardrails

- **No new dependencies** without asking. The dep list is deliberately tiny.
- **Never** put the Supabase `service_role` key in frontend code or the repo.
  The `anon` key is public by design — RLS is what protects the data.
- **Never** commit `.env`. It's gitignored; keep it that way.
- There is a **separate `matching-engine` project.** Concepts were borrowed
  (hard filters → bounded per-factor score → reason strings, config-driven).
  Do not import from it, vendor it, or merge the repos.
- Prefer editing existing files over adding new ones. This codebase should stay
  small enough to read in one sitting.

## Where things are

```
BUILD_PLAN.md          scope, 4-week arc, scoring reference
SESSION_A.md           runbook: Supabase + auth + deploy   ← current step
CLAUDE.md              this file
backend/
  models.py            Room, Preferences, RankRequest, RankResponse
  ranking.py           hard filters + 5-factor scoring + reason strings
  seed_rooms.json      12 seed rooms (source of truth for the seed SQL)
  main.py              /health, /rank
frontend/src/
  App.jsx              auth gate + form/results state
  api.js               the only file that knows the backend URL
  supabase.js          client + fetchRooms()
  components/          Auth, PreferenceForm, RoomCard (the fit receipt)
  styles.css           design tokens at the top
supabase/
  01_schema.sql        rooms table + RLS policies
  02_seed_rooms.sql    generated from seed_rooms.json — regenerate, don't hand-edit
render.yaml            backend deploy blueprint
```

## Status

- ✅ **Week 1** — ranking engine, `/rank`, React fit-receipt UI, verified end to end
- ✅ **Session A** — LIVE. Supabase (schema + 12 seed rooms, email confirmation
  off, RLS verified), backend on Render (`roomfit-api.onrender.com`), frontend on
  Vercel (`roomfit-peach.vercel.app`), CORS locked to the Vercel origin. Sign up →
  match → fit receipt works end to end.
- ✅ **UI refresh** — clean white theme + single pine-green accent, and a signed-out
  "Welcome to roomfit" hero. Chrome only; score ramp + fit receipt unchanged.
- ⬜ **Session B** — "add your room" form + "my listings" (edit/delete own only).
  RLS insert/update/delete policies already exist; this is frontend work.
- ⬜ **Testers** — 3 people, not yet recruited (long-lead item — the live link is
  ready to send).
- ⬜ **Demo Day pitch** — not drafted

## Working style

- Explain in short bullets, not essays.
- Ask before large refactors or anything that changes a locked decision above.
- When a task is done, say what changed and what's next — briefly.
