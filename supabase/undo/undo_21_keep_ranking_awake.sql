-- roomfit — undo 21_keep_ranking_awake.sql
-- Stops the 10-minute ping. The ranking service goes back to sleeping after
-- 15 idle minutes, and the first match after that waits ~30s again.
-- pg_cron and pg_net stay installed (the emails use them).
select cron.unschedule('roomfit-keep-ranking-awake')
 where exists (select 1 from cron.job where jobname = 'roomfit-keep-ranking-awake');
