-- roomfit — undo 27_message_emails.sql
-- One transaction: all of it happens, or none of it.
-- Stops the new-message email and removes mark_thread_read(). Messages
-- themselves are untouched; read_at values already stamped are cleared, as
-- before. The outbox's record of those emails is deleted so the kind check can
-- go back to the list 22_team_message_alert.sql left.
begin;

drop trigger if exists email_new_message on public.messages;
drop function if exists public.email_new_message();
drop function if exists public.mark_thread_read(bigint, uuid);

update public.messages set read_at = null where read_at is not null;

delete from public.email_outbox where kind = 'new_message';
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('host_interest', 'host_online', 'team_interest', 'team_claim',
                  'listing_expired', 'team_message'));

commit;
