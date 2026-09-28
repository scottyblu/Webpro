-- =============================================================================
-- THE BREAKFAST CLUB — admin notification emails
--
-- Run this in the Supabase SQL Editor AFTER 0002_zelle_payments.sql.
-- Safe to run more than once.
-- =============================================================================

-- Email addresses that receive admin alerts (Zelle reported, overdue, monthly summary).
alter table public.club_settings
  add column if not exists notification_emails text[] not null default '{}';

-- Allow the new admin alert types in the notification log.
alter table public.notification_log drop constraint if exists notification_log_type_check;
alter table public.notification_log add constraint notification_log_type_check check (type in (
  'payment_confirmation', 'upcoming_payment_reminder', 'failed_payment_notice', 'past_due_reminder',
  'admin_zelle_reported', 'admin_payment_failed', 'admin_overdue_summary', 'admin_monthly_summary', 'admin_test'
));
