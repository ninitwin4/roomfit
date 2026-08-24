# roomfit — build plan

A 30-day build challenge. **Target: finished by Aug 3, 2026.** Secondary
project: Goal = a complete end-to-end app that at least
3 real users can sign up for, add a listing, and get ranked matches.

## Locked scope decisions

- **Mobile-responsive web app**, not native.
- **One core loop:** set preferences → see rooms ranked by compatibility → see why each matched.
- **Matching is asymmetric:** seeker → room (person to listing), not person to person.
- **Deterministic ranking** for Day 30. LLM "why" is a stretch goal if early.
- **Auth + DB + user listings are in scope** (3 real users need them). Single role: everyone both sets preferences and can post a listing.
- **Reuse from matching-engine:** the *concepts* only (hard filters → bounded per-factor score → reason strings, config-driven). Separate repo.

## Match model

**5 scored factors** (0–20 each → total 0–100): budget fit, location,
cleanliness, social level, sleep schedule.

**3 hard filters** (drop the room entirely): more than 30% over budget, pets
needed but not allowed, smoking home when seeker isn't ok with it. Rooms up to
30% over budget are shown but scored low, and always sorted below affordable ones.

## 4-Phases arc

| Phase | Focus |
|------|-------|
| 1 | Foundations (local): data model, seed rooms, ranking engine, basic React UI. End-to-end locally, no auth. |
| 2 | Auth, DB & deploy: Supabase (Postgres + auth), seed rooms into DB, login. React → Vercel, FastAPI `/rank` → Render. Live. |
| 3 | User listings + real testers: "create listing" CRUD, 3 pod testers sign up, add rooms, run matches. Collect feedback, fix top issues. |
| 4 | Polish + continue backlog ideas: explanation polish, mobile spacing, empty states. |

---

## Phase 1 — detail (two sessions, ~4 hrs)

### Session 1 — backend core (~2 hrs) — DONE in this scaffold
- [x] Repo scaffold (`backend/`)
- [x] `Room` + `Preferences` Pydantic models (`models.py`)
- [x] 12 seed rooms, spread across all dimensions (`seed_rooms.json`)
- [x] `rank()` engine + per-factor reason strings (`ranking.py`)
- [x] `POST /rank` endpoint (`main.py`)

### Session 2 — frontend (~2 hrs) — DONE
- [x] React + Vite, mobile-responsive (`frontend/`)
- [x] Preference form → results list (ranked cards + reasons)
- [x] Wired to local FastAPI via `VITE_API_URL`
- [x] Loading, error, and no-results states
- [x] `.gitignore` + `.env.example` in place before any Supabase keys exist

**Phase 1 is done:** enter prefs locally → see ranked seed rooms with per-factor
reasons. ✅

### UI notes
- **The fit receipt is the product.** Every card shows its fit as a circular
  0–100 gauge (the top match larger) and, on tap, the five factors as
  slider-style bars with a plain-language reason each. The top result opens
  expanded so the *why* is visible without a tap.
- One color ramp (green ≥75% → amber ≥50% → clay below) carries both the total
  and each factor bar, so color always means the same thing.
- 1–5 ratings are sliders with a value bubble above the thumb (updated from the
  original five tap targets). Inputs are 16px so iOS doesn't zoom on focus.
- Hard filters are surfaced honestly: "6 ruled out on budget, pets, or smoking."
- Visual refresh: clean white theme with a single pine-green accent and a
  signed-out "Welcome to roomfit" hero; a loading spinner covers the match wait.

## Phase 2 / Session A — Supabase, auth & deploy — LIVE

Live: frontend `roomfit-peach.vercel.app`, backend `roomfit-api.onrender.com`,
Supabase (schema + 12 seed rooms, email confirmation off, RLS verified), CORS
locked to the Vercel origin. Step-by-step runbook: **`SESSION_A.md`**.

- [x] `supabase/01_schema.sql` — `rooms` table + Row Level Security (read all, write own)
- [x] `supabase/02_seed_rooms.sql` — the same 12 rooms, `owner_id` null
- [x] Auth UI (email + password, sign in / sign up) + auth gate + sign out
- [x] Frontend reads rooms from Supabase and posts them to `/rank`
- [x] `/rank` now takes `{ preferences, rooms }`; omitting `rooms` falls back to
      the seed file, so curl and local dev still work
- [x] `ALLOWED_ORIGINS` env var for CORS; `render.yaml` blueprint
- [x] Run the runbook: Supabase project → deploy → live URL → send to a tester

**Architecture note:** the backend never touches the database. The frontend
holds the Supabase session and sends rooms with the request, so `/rank` stays a
pure scoring service with no credentials to leak and nothing to migrate.

## Session B — user listings + testers — LIVE
- [x] "Add your room" form writing to Supabase with `owner_id = auth.uid()`.
- [x] "My listings" view: edit / delete your own only (RLS already enforces this).
- [x] Header tabs (Find a room / My listings); shared 1–5 sliders and `$` inputs.
- [x] 3 testers signed up; create / edit / delete verified live.
- [x] Collected tester feedback. Top issue: the first match felt slow. Measured
      it — warm it's ~140ms (Supabase ~40ms + `/rank` ~100ms); the delay was
      Render's free tier sleeping after ~15 min and cold-booting for ~30s.
      Fixed by pinging `/health` on app load so the container wakes while the
      user fills the form, stripping display-only fields from the `/rank` body
      (7470 → 2866 bytes, 62% smaller, responses byte-identical), and saying
      "waking the ranking service" after 3s instead of a silent spinner.
      Re-tested by a user: ~4s, down from ~30s.

## Polish — shipped
- [x] White theme + welcome hero, circular fit gauges, slider-style factor bars,
      loading spinner, money-input cleanup, empty / error states.

## Saved rooms — shipped
- [x] `favourites` table keyed `(user_id, room_id)`, so a duplicate save is
      impossible at the database level rather than guarded in the UI. RLS scoped
      to the owner; cascade delete from both users and rooms.
- [x] Heart on each result card (optimistic, hidden on your own listings) and a
      third "Saved" tab with a live count.
- [x] Saved rooms are re-ranked against the last search rather than freezing a
      score at save time. Preferences persist to `localStorage` — which also
      stops the form resetting to defaults every visit.
- [x] A saved room that later fails a hard filter is listed with the reason
      ("$1600 is over your $1000 budget") instead of silently disappearing.

## Profiles, avatars & messaging — shipped
- [x] `profiles` table (first/last name, avatar). A table rather than
      `auth.users` metadata, because PostgREST can't expose the auth schema —
      metadata could only ever show you your *own* name, never a room owner's.
- [x] Name collected as a second signup step; the header shows it instead of
      the email. Accounts created before this get asked once, on next visit.
- [x] Avatars: upload a photo, or initials on one of six palette colours.
      An unchosen colour is derived from the user id, so nobody is a grey blob.
      Editing opens from tapping your name in the header.
- [x] Messaging: one `messages` table, thread = (room_id, other participant).
      Single table on purpose — the read policy touches no other table, so RLS
      recursion is impossible. Messages are immutable (no UPDATE policy: one
      scoped to `recipient_id` would also allow rewriting `body`).
- [x] Room cards show the owner's avatar + first name and a Message button.
      Seed rooms stay ownerless and read "Sample listing" with no button — no
      invented persona, and the hybrid-listings decision stands.
- [x] Unread tracked in `localStorage`; new messages arrive on open/Refresh
      rather than Realtime. Both are deliberate trade-offs — see `unread.js`.

## Budget rescale — shipped
- [x] Budget was nominally a fifth of the score and moved the total by only ~4
      points: `12 + 8 × headroom` could reach 20/20 only at a rent of $0. A
      2-point cleanliness mismatch mattered 2.5× more than halving the rent.
- [x] Rescored across a band: 30% under = 20/20, at your limit ~10/20, 30% over
      = 0/20, beyond that filtered. Budget now moves the full 20 points.
- [x] The hard filter moved with it — rooms up to 30% over budget are shown,
      because people do stretch — and they are always sorted below every
      affordable room, so the app never leads with something unaffordable.
- [x] Reasons now carry the logic, not just the numbers: "right at your limit,
      nothing left over" instead of "$1600 vs $1600 max ($0 under)".
- [x] Over-budget results are tagged on the card, so it is never a surprise
      discovered only by opening the receipt.
- [x] Fixed a latent crash: a $0 budget divided by zero.

## Backlog — ideas, not commitments

- [ ] Public shareable listings (opt-in per room, owner profile + social links).
      Specced in detail already.
- [ ] Live message delivery via Supabase Realtime, and cross-device unread
      using the `read_at` column that's already reserved.

## Scoring reference

- **Budget fit** — cheaper scores higher, across a band around the stated
  budget: 30% under = 20/20, at your limit ~10/20, 30% over = 0/20, beyond that
  filtered out. Tune with `BUDGET_COMFORT` / `BUDGET_STRETCH` in `ranking.py`.
- **Location** — same area 20, different area 10 (not a dealbreaker, just not ideal).
- **Cleanliness / Social** — `20 − 5 × gap`, where gap is the 1–5 difference.
- **Sleep** — same 20, either flexible 14, early-vs-late clash 6.
- Ties break toward cheaper rent.

> Design note: I originally said budget should reward rooms *closer to the
> ceiling*. On reflection I flipped it to cheaper-is-better — more intuitive to
> explain to testers, and it's a one-line config change if you disagree.

## Run it locally

Two terminals.

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload          # http://127.0.0.1:8000
```

**Frontend**
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                        # http://localhost:5173
```

API: `GET /health`, `POST /rank` (body = `{ preferences, rooms? }`).

Example `/rank` body — `preferences` is required; omit `rooms` to fall back to
the seed file:

```json
{
  "preferences": {
    "budget_max": 1000,
    "location_pref": "Mission",
    "cleanliness_pref": 4,
    "social_pref": 4,
    "sleep_pref": "late",
    "needs_pets": false,
    "smoking_ok": false
  }
}
```
