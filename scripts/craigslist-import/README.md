# Craigslist import

Brings San Francisco rooms from Craigslist into RoomFit, so people can say
"I'm interested" before the host has ever heard of RoomFit. Database side:
`supabase/15_craigslist.sql` (rooms, interests, emails) and
`supabase/16_email_sending.sql` (sending them, team alerts).

## How the pieces fit

| When | What | Where |
|---|---|---|
| 9:00 PT daily | `import.mjs` scrapes new posts and adds them as **live** rooms | this Mac (launchd) |
| 10:00 PT daily | the email bot finds each post's reply address; saving it makes the room **live** | the bot ([EMAIL_BOT.md](EMAIL_BOT.md)) |
| First "I'm interested" on a room | one email to the host with a 14-day claim link | database → `email_outbox` → mailer → Gmail |
| Every "I'm interested" | a team alert to everyone in `team_recipients` | same |
| Host claims the room | each interested person's note becomes their first message; each gets an email; a team alert | same |

A room shows **I'm interested** while `source = 'craigslist'` and
`claimed_at` is null, and **Message** after that.

## What gets imported

From `https://www.craigslist.org/search/subarea/sfc?cat=roo&hasPic=1&sort=date`
(San Francisco only, rooms & shares, with photos), through the Apify Actor
`memo23/craigslist-scraper`. A post is **skipped** when it has:

- no title, or no price, or a price under $300 or over $4,000 (a whole flat);
- a daily or weekly rent, or is a shared ("room not private") room;
- a map pin outside San Francisco (the "sfc" list mixes in Daly City and
  San Jose);
- a neighbourhood that can't be matched to a RoomFit area;
- no photos;
- already been imported (by its post key), or is older than 3 weeks.

Each room gets the title, rent, area, description (up to 2,000 characters),
pets from "cats/dogs are OK", and the **first 3 photos**, copied into Supabase
storage. Cleanliness, social level and sleep schedule are placeholders (3, 3,
flexible): the host must answer them when claiming.

Each run also deletes unclaimed imports that can't go anywhere (post over 30
days old, or the bot found it gone, wrong, without an email, or failed three
times), with their photos.

## Setup (once)

1. **Run `supabase/15_craigslist.sql`** on the database.
2. **Make an import account.** Sign up in the app with a dedicated email
   (e.g. `import@…`), then in the dashboard set its `profiles.role` to `admin`.
   Imported rooms belong to it until claimed, so keep it separate from your own.
3. **Fill in `.env`:**
   ```bash
   cp .env.example .env
   ```
4. **Try it without writing anything:**
   ```bash
   node import.mjs --dry-run
   ```
   Add `--dataset=<id>` to reuse an earlier Apify run instead of paying for a
   new scrape.
5. **Run it for real once** and check the rooms in the app (they're live
   straight away):
   ```bash
   node import.mjs
   ```
6. **Schedule it.** Replace `REPO` in `com.joinroomfit.craigslist-import.plist`
   with the full path of your checkout, then:
   ```bash
   cp com.joinroomfit.craigslist-import.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.joinroomfit.craigslist-import.plist
   ```
   It runs at 9:00 the Mac's local time, so the Mac must be on Pacific time.
   Output goes to `import.log` here.

## Sending the emails

The database writes every email as a row in `email_outbox`, then sends it
itself (`supabase/16_email_sending.sql`):

- A trigger posts each new row to the mailer, a Cloud Run function that sends
  plain text through Gmail as joinroomfitapp@gmail.com
  (`https://roomfitemailer-1006948760009.us-west2.run.app`). It uses `pg_net`,
  so nothing is sent if the transaction fails.
- The mailer's key is in **Supabase Vault** as `roomfit_mailer_api_key`, never
  in the repo. To change it:
  `select vault.update_secret(id, '<new key>') from vault.secrets where name = 'roomfit_mailer_api_key';`
- Every 5 minutes, `pg_cron` runs `sync_email_status()`: each row gets
  `sent_at`, or `last_error` and another try (three in all, within a day).
- Team alerts go to every address in `public.team_recipients` (admin-only),
  one email each. Add or remove people there with SQL; the addresses stay out
  of the repo because it's public.

What's waiting or failed:
`select id, kind, to_email, attempts, last_error from email_outbox where sent_at is null;`

## Costs

About $0.0015 per scraped post plus $0.007 per run, capped by
`MAX_CHARGE_USD`. At 150 posts a day that's about $7 a month of Apify credit.
Photos are 600×450 (around 50 KB each), three per room.
