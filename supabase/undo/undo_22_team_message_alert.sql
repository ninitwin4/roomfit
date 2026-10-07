-- roomfit — undo 22_team_message_alert.sql
-- One transaction: all of it happens, or none of it.
-- Stops the team-inbox email for new messages. Messages themselves are
-- untouched. The outbox's record of those emails is deleted so the kind
-- check can go back to the list 17_listing_expiry.sql left.
begin;

drop trigger if exists team_alert_message on public.messages;
drop function if exists public.team_alert_message();

delete from public.email_outbox where kind = 'team_message';
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('host_interest', 'host_online', 'team_interest', 'team_claim',
                  'listing_expired'));

commit;
