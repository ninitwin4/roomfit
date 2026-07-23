# Session A — Supabase + auth + deploy

Goal: a live URL you can text to a tester. Budget ~2–2.5 hrs.
---

## 1. Supabase project (~15 min)

1. supabase.com → **New project**. Pick a region near you. Save the DB password
   somewhere safe (you won't need it for this app, but you'll want it later).
2. **SQL Editor → New query** → paste `supabase/01_schema.sql` → Run.
3. New query → paste `supabase/02_seed_rooms.sql` → Run.
4. **Table Editor → rooms** — you should see 12 rows.

**Turn off email confirmation for the demo:**
Authentication → Sign In / Providers → Email → uncheck **Confirm email** → Save.
Without this, every tester waits on an email before they can get in, and free
projects have a low email rate limit. Turn it back on if this ever goes public.

✅ *Check:* 12 rooms in the table, email provider enabled.

---

## 2. Wire the frontend locally (~20 min)

```bash
cd frontend
cp .env.example .env
```

Fill in from **Project Settings → API**:
- `VITE_SUPABASE_URL` — the Project URL
- `VITE_SUPABASE_ANON_KEY` — the `anon` `public` key

> The anon key is meant to be public — Row Level Security is what protects the
> data. The `service_role` key is the dangerous one: it bypasses RLS entirely.
> It must never appear in frontend code or in the repo.

```bash
npm install
npm run dev
```

In another terminal:

```bash
cd backend && uvicorn main:app --reload
```

✅ *Check:* create an account, sign in, run a match, see ranked rooms from the
database (not the JSON file).

---

## 3. Deploy the backend to Render (~20 min)

1. Push to GitHub first (`.gitignore` already excludes `.env`).
2. render.com → **New → Blueprint** → pick the repo. It reads `render.yaml`.
3. Leave `ALLOWED_ORIGINS` as `*` for now — you'll tighten it in step 5.
4. Wait for the build, then open `https://YOUR-SERVICE.onrender.com/health`.

✅ *Check:* `{"ok":true,"seed_rooms":12}`.

> Free Render services sleep after ~15 min idle, so the first request after a
> quiet spell takes ~30s. Warm it up right before you demo.

---

## 4. Deploy the frontend to Vercel (~20 min)

1. vercel.com → **Add New → Project** → same repo.
2. **Root Directory:** `frontend`. Framework preset: Vite (auto-detected).
3. Environment Variables — add all three:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` → your Render URL (no trailing slash)
4. Deploy.

✅ *Check:* open the Vercel URL **on your phone**, sign in, run a match.

---

## 5. Close the loop (~10 min)

1. Render → your service → Environment → set `ALLOWED_ORIGINS` to your exact
   Vercel URL (e.g. `https://roomfit.vercel.app`). Save; it redeploys.
2. Supabase → Authentication → URL Configuration → set **Site URL** to the
   Vercel URL.
3. Reload the live site and run one more match to confirm nothing broke.

✅ *Check:* a match still returns rooms after CORS is locked down. If you get a
CORS error, the origin string doesn't match exactly — check `https://` and no
trailing slash.

---

## 6. Ship the link (5 min — do not skip)

Send the URL to your first tester **today**. Recruiting is the long-lead item;
the code is not. Suggested message:

> I built a thing that matches you to rooms and shows you *why* each one ranked
> where it did. Takes 2 minutes — would love to know if the reasons make sense
> to you. [link]

---

## Done when

- Live Vercel URL works on a phone
- Sign up → sign in → match → ranked rooms with fit receipts
- Rooms come from Supabase
- CORS locked to your Vercel origin
- Link is in at least one tester's hands

## Not in this session

User-submitted listings (Session B). Everyone sees the same 12 seed rooms for
now — which is enough for a real tester to give you real feedback on the
matching, which is the part you actually want tested.
