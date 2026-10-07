# CLAUDE.md — roomfit

Read this first, every session.

## What this is

A mobile-responsive web app that matches renters to rooms and shows **why**
each room ranked where it did. It started as a solo 30-day challenge and is
now an ongoing build, with no end date.

**Time budget: ~3–5 focused hrs/week.** This is a secondary project. When
something doesn't fit the budget, cut scope — never add hours.

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
- **Matching is asymmetric:** seeker → room (person to listing), not person to
  person. Amended: messaging *is* person-to-person, but **ranking** still only
  ever scores a person against a listing. Don't add person-to-person scoring.
- **Ranking is deterministic.** No LLM in the scoring path.
- **5 scored factors**, 20 pts each → 0–100: budget fit, location, cleanliness,
  social level, sleep schedule.
- **3 hard filters** that drop a room entirely: **more than 30% over budget**,
  pets needed but not allowed, smoking home when the seeker isn't OK with it.
  Amended: rooms up to 30% over budget are now *shown* (people do stretch),
  scored low, and always sorted below every affordable room.
- **Budget scoring is cheaper-is-better** (more budget left over), scored across
  a band: 30% under earns 20/20, at your limit ~10/20, 30% over 0/20. Replaced
  `CHEAPER_IS_BETTER`, which could only reach 20/20 at a rent of $0 and so moved
  the total by ~4 points instead of 20. Knobs: `BUDGET_COMFORT` and
  `BUDGET_STRETCH` in `backend/ranking.py`.
- **Single role.** Every user both sets preferences and can post a listing. No
  seeker/lister split. Amended: there is now an **admin** role
  (`profiles.role`), set by hand in the Supabase dashboard and never from the
  app (a trigger blocks it). Admins get operator tools — hidden listings,
  original post links, claim links — but still no seeker/lister split.
- **Claimable listings.** Admins copy a room from another site as an inactive
  listing, then send a one-time claim link
  (`/?claim=<token>`, 14 days). The owner signs up or in, can edit everything,
  and on Accept becomes the owner and the listing goes live. Claiming happens
  only in the `claim_room` database function; photos are copied into the
  claimer's folder on Supabase's servers. Owners can pause their own listings.
- **The claimer must answer the three lifestyle questions.** Cleanliness,
  social level and sleep schedule are the whole reason the claim screen
  exists — they're what a public post can never tell you. They arrive
  pre-filled from the admin's draft, so claim mode shows them blank ("—", no
  accent fill) and keeps "Accept and publish" disabled until each has been
  touched. Any interaction counts, including tapping a slider where it already
  sits. The columns are `NOT NULL`, so unanswered is only ever a state in
  `RoomForm` — never a value in the database. Don't remove this: without it the
  fastest path through the claim screen publishes the middle of every scale,
  and nothing afterwards can tell that apart from a real answer.
- **Craigslist rooms take "I'm interested", not messages, until claimed.** A
  script on Vincent's Mac (`scripts/craigslist-import/`, daily 9:00 PT, Apify
  `memo23/craigslist-scraper`) imports SF rooms with photos as **live** rooms
  owned by an import admin (`rooms.source = 'craigslist'`). The host is emailed
  once, with a claim link, when someone is interested and the post's reply
  address is known (`queue_host_email()`): on the first "I'm interested" if the
  address is already saved, or when `report_email()` saves it later. Every
  interest alert to the team carries the room's claim link, so the team can
  send it by hand when there's no address; the host email reuses that link. On
  claim (`rooms.claimed_at`), each interested person's note becomes
  their own one-to-one thread and they get an email. Emails are rows in
  `email_outbox`, posted by `pg_net` to the Cloud Run mailer (Gmail as
  joinroomfitapp@gmail.com; key in Vault); every interest and every claim also
  emails the team (`team_recipients`). The reply address lives in `room_sources`
  (admin-only), never on `rooms`. No reminders, and never anything that gets
  past Craigslist's CAPTCHA.
- **Listings last 30 days.** `rooms.expires_at` is set by the database (30
  days from posting, and again from a claim), never by the app. A daily job
  (17:00 UTC) pauses expired listings and emails the owner; "Show again" on an
  expired listing renews it for 30 days. Sample rooms and unclaimed Craigslist
  imports have no expiry. Nothing is ever deleted for expiring.
- **Real listings only.** The 12 sample rooms from `02_seed_rooms.sql`
  (`owner_id` null) kept the app from looking empty early on; they were removed
  on Oct 7, 2026 (`23_remove_sample_listings.sql`), when Craigslist imports and
  team-added rooms filled it. Every room now has an owner. `seed_rooms.json`
  stays as `/rank`'s fallback for curl and local dev only. Keep `P1.jpg`,
  `P3.jpg` and `P7.jpg` in the `room-photos` bucket: the landing page's demo
  shows them.
- **The fit receipt is the product.** Every result shows its per-factor
  breakdown with a plain-language reason. Don't reduce it to a single number.
- **Type: one serif moment, sans everywhere else.** EB Garamond 600 sets the
  hero and the wordmark. Plus Jakarta Sans sets everything else — `--ui` for
  headings, `--body` for text. JetBrains Mono (`--data`) carries scores, rents
  and claim links. The serif is rationed on purpose: it carries a page at 44px
  and comes apart at 17px, where the thin strokes lighten until a room title
  stops out-ranking the grey line beneath it. **Don't extend `--display` to
  small headings** — that's the change that looks like tidying up and quietly
  inverts the hierarchy.
- **A warm cream ground, with white cards.** `--paper` is `#f4f1e5`; cards stay
  pure white so the fit receipt reads as an object on the page rather than as
  more page. That also protects the score ramp: `--fit-mid` is amber, and an
  amber bar on a cream ground would start sharing a family with it — on a white
  card it doesn't. Two things move with the ground if it's ever warmed further:
  `--ink-soft` (darkened to `#646d66` from `#6b756e` to hold 4.5:1 on all
  three grounds — it carries every hint, factor reason and room meta line, and
  `--surface` is the one it fails first, where the Sample-listing and Paused
  tags sit), and the amber, which needs re-checking against the new paper.

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
- **Adding or changing a domain touches three places, none of them code:**
  Render `ALLOWED_ORIGINS` (comma-separated, exact match — no trailing slash, or
  every match fails with a CORS preflight 400), Supabase Auth → URL Configuration
  (Site URL + a `https://<domain>/**` Redirect URL), and Vercel's domain list. The
  frontend builds claim links and reset redirects from `window.location.origin`,
  so nothing in `src/` names a domain — keep it that way.
- **Database before app.** Run a PR's migrations on the live database before
  merging any app change that reads them; the app deploys on merge and fails if
  a column is missing (PR #5, Oct 6).

## Landing page

`landing/` is the marketing page for joinroomfit.com: a separate Next.js
project (plain CSS modules, three.js for the hero sky only), deployed as its
own Vercel project from that folder. Its waitlist lives in the same Supabase
project (`supabase/13_waitlist.sql`). `landing/README.md` covers running,
deploying, and where the build departs from the spec.

- **Read `landing/DESIGN_SPEC.md` before any landing work.** It is the source
  of truth for copy, behaviour and data, and it holds the build plan and the
  open decisions.
- **Don't modify `frontend/` or `backend/` when working on it.** The landing
  page links to the app at app.joinroomfit.com; it never changes it.
- **The HTML export in `landing/design/` is visual reference only.** Match its
  layout, spacing and illustration, but don't copy it wholesale into the
  Next.js build: it uses fixed pixel widths and inline styles, and the spec
  wins wherever the two disagree.

## Where things are

```
README.md              public front door: goal, architecture, status, roadmap
BUILD_PLAN.md          scope, phase arc, scoring reference, backlog
SESSION_A.md           runbook: Supabase + auth + deploy (done)
CLAUDE.md              this file
backend/
  models.py            Room, Preferences, RankRequest, RankResponse
  ranking.py           hard filters + 5-factor scoring + reason strings
  seed_rooms.json      12 seed rooms (source of truth for the seed SQL)
  main.py              /health, /rank
frontend/src/
  App.jsx              auth gate, tabs, match flow, favourites state
  api.js               backend URL, warmUp(), strips non-scored fields
  supabase.js          client + all DB/storage helpers
  components/
    Auth.jsx           email + password sign in / sign up
    PreferenceForm.jsx the search form
    RoomCard.jsx       the fit receipt — gauge, gallery, factor bars, heart,
                       Description toggle (display-only, never scored),
                       Message or I'm interested
    InterestSheet.jsx  the "I'm interested" popup (note to the host)
    RoomForm.jsx       add / edit / claim a listing, photo upload, admin fields
    MyListings.jsx     your own rooms: edit, pause, delete; claim screen;
                       admin claim links + share sheet
    SavedRooms.jsx     saved rooms, re-ranked against your last search
    Messages.jsx       inbox + thread, owns its own back-and-forth; suggested
                       first replies for a room's owner
    Avatar.jsx         photo or coloured initials; palette lives here
    ProfileEditor.jsx  the profile sheet (avatar + name)
    NameStep.jsx       one-time "enter your name" after signup
    ResetPassword.jsx  set a new password after a reset link
    Scale.jsx          shared 1–5 slider with value bubble
  unread.js            localStorage unread tracking (and why it's not read_at)
  styles.css           design tokens at the top
supabase/              run in numerical order
  01_schema.sql        rooms table + RLS policies
  02_seed_rooms.sql    generated from seed_rooms.json — regenerate, don't hand-edit
  03_photos.sql        photo_url column + room-photos bucket + storage policies
  04_photos_multi.sql  photos text[] (photos[1] = cover), backfilled
  05_favourites.sql    favourites table + RLS
  06_profiles.sql      profiles (names, avatar) + RLS
  07_avatars.sql       avatar_color + avatars bucket + storage policies
  08_messages.sql      messages table + RLS (immutable by design)
  09_hidden_threads.sql  remove a conversation from your own inbox
  10_roles.sql         profiles.role + trigger so nobody promotes themselves
  11_claims.sql        rooms.active, room_sources, claim_links + claim functions
  12_descriptions.sql  rooms.description (optional, 2,000 chars), carried by claims
  13_waitlist.sql      landing-page waitlist + join_waitlist() (closed table)
  14_waitlist_neighborhoods.sql  up to 3 neighbourhoods per waitlist sign-up
  15_craigslist.sql    rooms.source/claimed_at, room_interests, email_outbox,
                       import + email-bot functions, claimed_at on claim
  16_email_sending.sql pg_net sends the outbox to the mailer, pg_cron syncs
                       results and retries, team alerts on interest and claim
  17_listing_expiry.sql  rooms.expires_at, 30-day listings, daily pause + email
  18_import_cleanup_fixes.sql  rejected_imports; cleanup spares rooms awaiting a claim
  19_imports_go_live.sql       imports go live at once; host email via queue_host_email()
  20_team_alert_claim_link.sql claim link in team alerts; host email reuses it
  21_keep_ranking_awake.sql    pg_cron pings Render's /health every 10 min
  22_team_message_alert.sql    email the team inbox on new messages to the team account
  23_remove_sample_listings.sql  remove the 12 ownerless sample rooms (ids 1–12)
  24_posted_at.sql             rooms.posted_at (post date or date added), set by the DB
  undo/                one undo script per migration from 10 on
scripts/craigslist-import/
  import.mjs           daily scrape → live rooms (no dependencies)
  EMAIL_BOT.md         instructions the email bot follows
  README.md            setup, launchd schedule, sending the emails
render.yaml            backend deploy blueprint
landing/               landing page (separate Next.js project + its design handoff)
```

## Status

- ✅ **Week 1** — ranking engine, `/rank`, React fit-receipt UI, verified end to end
- ✅ **Session A** — LIVE. Supabase (schema + 12 seed rooms, email confirmation
  off, RLS verified), backend on Render (`roomfit-api.onrender.com`), frontend on
  Vercel at **`app.joinroomfit.com`** (the old `roomfit-peach.vercel.app` still
  serves, because claim links already sent point at it). Sign up → match → fit
  receipt works end to end.
- ✅ **UI refresh** — single pine-green accent, circular fit gauges, slider-style
  factor bars, and a signed-out hero. Chrome only; score ramp + fit receipt
  unchanged.
- ✅ **Type + ground** — EB Garamond hero and wordmark over Plus Jakarta Sans, on
  a warm cream paper with white cards. The hero reads "Find a room that *fits*"
  (the eyebrow already says roomfit, so the headline says what the app does),
  and the third value prop speaks to listers, who reach this screen through a
  claim link. The two rules that keep this working are in the locked decisions
  above.
- ✅ **Session B** — LIVE. Header tabs (Find a room / My listings), add/edit room
  form, my-listings with edit + inline-confirm delete, RLS-guarded write helpers
  in supabase.js. Create / edit / delete verified against the live DB.
- ✅ **Room photos** — up to 5 per room with a chosen cover (`photos text[]`,
  `photos[1]` is the cover). Public `room-photos` bucket with storage policies
  scoped to `{uid}/` paths; browser-side downscale before upload (~11MB → ~240KB).
  Swipeable gallery with dots on result cards. `App.jsx` merges Supabase rows
  back over the `/rank` response, because the backend echoes only its scored
  fields and would otherwise drop `photos` silently.
- ✅ **Testers + first feedback** — 3 accounts, each able to add a listing and run
  a match. Top reported issue (slow first match) diagnosed and fixed; see
  BUILD_PLAN for the numbers.
- ✅ **Saved / favourite rooms** — heart on each result, third "Saved" tab with a
  live count. `favourites` keyed `(user_id, room_id)` so duplicate saves are
  impossible; RLS scoped to the owner. Saved rooms are re-ranked against the last
  search (prefs persist to `localStorage`), and one that stops matching is listed
  with the reason instead of vanishing.
- ✅ **Profiles, avatars & names** — `profiles` table; name collected at signup
  and shown instead of the email; avatar is a photo or initials on a palette
  colour, edited by tapping your name in the header.
- ✅ **In-app messaging** — Inbox tab, threads keyed by (room, other person),
  immutable messages, unread in `localStorage`. Room cards show the owner's
  avatar + first name and a Message button; seed rooms read "Sample listing"
  and aren't messageable.
- ✅ **Admin role + claimable listings** — LIVE. Admins add hidden listings
  copied from other sites, keep the original post
  link, and send a one-time claim link; the owner claims, edits and publishes.
  Owners can pause listings; admins can include inactive rooms in search.
  Migrations 10–12 are on the live database, and the app merged from
  `Vincent_Changes`. The claim screen requires the three lifestyle answers
  before it will publish.
- ✅ **Landing page** — LIVE on joinroomfit.com (www redirects to it), its own
  Vercel project (`roomfit-landing`) deploying `landing/` from `main`. Waitlist
  sign-ups land in the `waitlist` table, verified with a real sign-up.
- ✅ **Craigslist import + "I'm interested"** — LIVE (PRs #4, #5). Migrations
  15–20 are on the live database. 99 imported rooms are live (Oct 6); 28 have
  a reply address. Team alerts go to the team inbox (`team_recipients`). The email bot is
  stopped; the daily import isn't scheduled yet. Open from Nini's review: the
  bot's database access, double sends on a slow mailer, note spam, the
  CAN-SPAM footer and opt-out, and Craigslist's terms.
- ⬜ **Public shareable listings** — specced, not started (the last planned item)

## Working style

- Explain in short bullets, not essays.
- Ask before large refactors or anything that changes a locked decision above.
- When a task is done, say what changed and what's next — briefly.
- **Open with a recap.** Start a session with a short plain summary of where
  the project stands: what shipped last, what's live, what's still open. A few
  lines, not a report. I should get the context without reading back through
  the log — and if the recap is hard to write, that's the signal the status
  section above has gone stale and needs updating first.
- **Always end with the next action.** Every reply finishes by naming the next
  thing to do, or the decision that's waiting on me. Don't leave it implied,
  and don't stop at "let me know what you'd like" — if there's genuinely
  nothing outstanding, propose the next thing worth doing and say why.
- **Show written work before committing it.** Docs, specs and anything I'd
  read rather than run get pasted in chat first. Commit on a yes.
