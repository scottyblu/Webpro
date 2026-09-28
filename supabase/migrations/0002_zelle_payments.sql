-- =============================================================================
-- THE BREAKFAST CLUB — Zelle payments
--
-- Run this in the Supabase SQL Editor AFTER 0001_initial_schema.sql.
-- Safe to run more than once.
-- =============================================================================

-- Where members send Zelle payments (shown on their dashboard).
alter table public.club_settings add column if not exists zelle_recipient_name text;
alter table public.club_settings add column if not exists zelle_contact text;  -- Zelle email or phone number

-- A member can have at most one "I've sent it" report waiting for confirmation per month.
create unique index if not exists payments_one_pending_report_per_month
  on public.payments (member_id, payment_year, payment_month)
  where payment_status = 'pending' and stripe_payment_id is null and member_id is not null;
