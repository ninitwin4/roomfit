# roomfit — build plan

A 30-day build challenge. **Target: finished by Aug 3, 2026.** Secondary
project: ~3–5 focused hrs/week, so scope gets tightened rather than hours added. Goal = a complete end-to-end app that at least
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

**3 hard filters** (drop the room entirely): over budget, pets needed but not
allowed, smoking home when seeker isn't ok with it.

## 4-week arc

| Phase | Focus |
|------|-------|
| 1 | Foundations (local): data model, seed rooms, ranking engine, basic React UI. End-to-end locally, no auth. |
| 2 | Auth, DB & deploy: Supabase (Postgres + auth), seed rooms into DB, login. React → Vercel, FastAPI `/rank` → Render. Live. |
| 3 | User listings + real testers: "create listing" CRUD, 3 pod testers sign up, add rooms, run matches. Collect feedback, fix top issues. |
| 4 | Polish + Demo Day: explanation polish, mobile spacing, empty states, pitch. |

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
- **The fit receipt is the product.** Every card shows a 0–100 score and, on
  tap, the five factors as bars with a plain-language reason each. The top
  result opens expanded so the *why* is visible without a tap.
- One color ramp (green ≥75% → amber ≥50% → clay below) carries both the total
  and each factor bar, so color always means the same thing.
- 1–5 ratings are five tap targets, not a slider — sliders are miserable on
  phones. Inputs are 16px so iOS doesn't zoom on focus.
- Hard filters are surfaced honestly: "6 ruled out on budget, pets, or smoking."

## Phase 2 / Session A — Supabase, auth & deploy — SCAFFOLDED

Step-by-step runbook: **`SESSION_A.md`**.

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

## Session B — user listings + testers
- "Add your room" form writing to Supabase with `owner_id = auth.uid()`.
- "My listings" view: edit / delete your own only (RLS already enforces this).
- Testers sign up, add a room, run a match. Collect feedback, fix the top issue.

## Then — Demo Day
- Pitch (start drafting in parallel, not at the end).
- Polish: mobile spacing, empty states, warm the Render service before demoing.

## Scoring reference

- **Budget fit** — cheaper scores higher (more budget left over). Flip
  `CHEAPER_IS_BETTER` in `ranking.py` to reward rooms nearer the ceiling instead.
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
