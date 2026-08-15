# 🏠 RoomFit

[![Live demo](https://img.shields.io/badge/demo-roomfit--peach.vercel.app-2f6f4e)](https://roomfit-peach.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-Vite-61dafb)](https://vitejs.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688)](https://fastapi.tiangolo.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e)](https://supabase.com)

> A mobile-first **web app** that ranks rooms by how well they actually fit you — and shows the receipt to prove it.

### 🔗 Live app → **[roomfit-peach.vercel.app](https://roomfit-peach.vercel.app/)**

---

## 🌟 Highlights

- **Every match comes with a receipt.** Not just a number — the five factors behind the score, each with a plain-language reason.
- **Deterministic ranking.** No LLM in the scoring path. The same input always produces the same result, so a score is explainable and reproducible.
- **Hard filters are honest.** Dealbreakers drop a room entirely, and the app tells you how many and why: *"6 ruled out on budget, pets, or smoking."*
- **Post your own room** with up to 5 photos and a chosen cover.
- **Mobile-first.** Built to be used on a phone while actually flat-hunting.

---

## ℹ️ Overview

Every room listing tells you the rent and the neighborhood. Almost none of them tell you the thing that actually decides whether you'll be happy there: **whether you'd live well with the people already in the house.**

I ran into this myself. Finding a sublet in a big city — a place you actually want to call home, not just one that fits your budget — is a hassle. So is the reverse: finding the right person to fill a room when you're the one leaving. And there aren't many places to look. Most of it still happens in Facebook groups, where listings scroll past as plain text and there's no way to tell which ones would genuinely suit you.

Even the sites that do claim to "match" you hand back an opaque percentage with no reasoning behind it. You can't tell whether an 85% means the rent fits or the lifestyle fits — and those are very different things when you're signing a lease.

RoomFit is my answer to that: a mobile-responsive web app where you set your budget, area, tidiness, how social you want the home to be, and your sleep schedule. It applies three hard filters, scores every remaining room across five factors, and then **shows its work** — every result opens into a breakdown explaining exactly where the points came from and why.

The scoring is deliberately boring — bounded, capped, and rule-based. That's the point. When a room ranks second instead of first, you should be able to see the reason in one glance rather than trusting a black box.

### 📐 How the score works

**5 scored factors**, 20 points each → **0–100**: budget fit, location, cleanliness, social level, sleep schedule.

**3 hard filters** that drop a room entirely: over budget, pets needed but not allowed, smoking home when you're not okay with that.

Budget scoring is *cheaper-is-better* — more of your budget left over scores higher. Ties break toward cheaper rent. Full scoring reference in [BUILD_PLAN.md](BUILD_PLAN.md).

### 🧱 Architecture

The backend **never touches the database.** The frontend holds the Supabase session, reads rooms, and posts `{ preferences, rooms }` to `/rank`. The ranking service scores and explains — it holds no credentials and stores no user data.

```
frontend (Vercel)  ──reads/writes──▶  Supabase (Postgres + Auth + Storage, RLS)
       │
       └──POST { preferences, rooms }──▶  ranking API (Render) ──▶ scores + reasons
```

Row Level Security is what protects the data: signed-in users can read every listing, but only ever write their own.

### ✍️ Author

Built by **[Ni Ni (@ninitwin4)](https://github.com/ninitwin4)**.

---

## 🔗 Related project

**[matching-engine](https://github.com/ninitwin4/matching-engine)** — a separate, more general compatibility-matching engine in Python.

RoomFit **reuses the concepts, not the code**: hard filters first, then a bounded per-factor score, with every factor emitting its own reason string, all driven by config rather than branching logic. The two repos stay independent by design — nothing is imported, vendored, or merged.

Both share the `compatibility-matching` topic tag.

---

## 🚀 Usage

The whole product is one loop:

**Set your preferences → see rooms ranked → see why each one ranked there.**

1. Sign up with an email and password.
2. Set your budget, area, tidiness, social level, and hours.
3. Hit **Find my fit** — rooms come back ranked 0–100.
4. Tap **Why this score?** on any result to open its fit receipt.

You can also switch to **My listings** to post your own room, add photos, and pick a cover.

The ranking API is stateless and can be called directly. Omit `rooms` and it falls back to the bundled seed data:

```bash
curl -X POST https://roomfit-api.onrender.com/rank \
  -H 'content-type: application/json' \
  -d '{"preferences":{"budget_max":1000,"location_pref":"Mission",
       "cleanliness_pref":4,"social_pref":4,"sleep_pref":"late",
       "needs_pets":false,"smoking_ok":false}}'
```

> **Note:** the API runs on a free tier that sleeps after ~15 minutes idle. The first request after a quiet spell can take ~30 seconds to wake; every one after that is ~100 ms.

---

## ⬇️ Running it locally

Requires **Python 3.10+** and **Node 18+**. Two terminals.

**Backend**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload          # http://127.0.0.1:8000
```

**Frontend**

```bash
cd frontend
cp .env.example .env               # then fill in your Supabase URL + anon key
npm install
npm run dev                        # http://localhost:5173
```

To point at your own Supabase project, run the SQL files in `supabase/` in numerical order (`01_schema.sql` → `04_photos_multi.sql`).

---

## 📍 Status

| | |
|---|---|
| ✅ | Ranking engine, `/rank` API, fit-receipt UI |
| ✅ | Supabase auth + Postgres with RLS; deployed to Vercel + Render |
| ✅ | Post / edit / delete your own listings |
| ✅ | Room photos — up to 5, chosen cover, swipeable gallery |
| ✅ | 3 real testers; first feedback round shipped |
| ⬜ | Demo Day pitch |

---

## 💭 Future enhancements

- **Saved rooms** — shortlist the ones you like and come back to them later.
- **Profile avatars** — a face next to a listing, so a room feels like it belongs to a person.
- **In-app messaging** — let a seeker and a room owner talk without leaving the app.
- **Shareable listings** — a public link for a listing, opt-in per room, with the owner's profile and social links.
- **LLM-written explanations** — as a layer *on top of* the deterministic score, never inside the scoring path.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
