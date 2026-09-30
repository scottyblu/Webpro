-- =============================================================================
-- THE BREAKFAST CLUB — Venmo payments
--
-- Run this in the Supabase SQL Editor AFTER 0006_club_logo.sql.
-- Safe to run more than once.
-- =============================================================================

-- The Venmo username members pay (without the @). Blank hides the Venmo option.
alter table public.club_settings add column if not exists venmo_username text;

-- Lets /setup-check confirm which SQL files have been run.
create or replace function public.tbc_schema_version()
returns integer
language sql
stable
as $$ select 7 $$;

revoke all on function public.tbc_schema_version() from public, anon, authenticated;
grant execute on function public.tbc_schema_version() to service_role;
