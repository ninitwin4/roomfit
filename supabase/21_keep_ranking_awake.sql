-- roomfit — keep the ranking service on Render awake.
-- Run AFTER 20_team_alert_claim_link.sql, in the Supabase SQL editor.
-- Undo: undo/undo_21_keep_ranking_awake.sql
--
-- Render's free plan puts the backend to sleep after 15 minutes without a
-- request, and the next match then waits ~30s while it boots (warm, /rank
-- answers in ~0.15s). The app pings /health when it opens, but someone who
-- taps Find straight away still beats it. So the database pings /health every
-- 10 minutes and it never falls asleep.
--
-- Free, as long as this is the only free service on the Render account: the
-- free plan includes 750 hours a month, and one service running all month
-- uses at most 744. Upgrading the service to a paid plan makes this
-- unnecessary; unschedule it then.
--
-- Uses pg_cron and pg_net, already installed by 16_email_sending.sql. Running
-- this again just replaces the job.

select cron.schedule(
  'roomfit-keep-ranking-awake',
  '*/10 * * * *',
  $$select net.http_get(
      url := 'https://roomfit-api.onrender.com/health',
      timeout_milliseconds := 60000 -- room for a cold boot
    )$$
);
