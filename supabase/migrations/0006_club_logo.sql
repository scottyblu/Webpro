-- =============================================================================
-- THE BREAKFAST CLUB — firehouse logo
--
-- Run this in the Supabase SQL Editor AFTER 0005_allocations_and_reminders.sql.
-- Safe to run more than once.
--
-- The logo is uploaded in Admin → Settings → Firehouse logo. The app stores a few
-- ready-sized copies (the in-app logo and the home-screen app icons) as data URLs.
-- =============================================================================

alter table public.club_settings add column if not exists logo_images jsonb;
alter table public.club_settings add column if not exists logo_updated_at timestamptz;

-- Lets /setup-check confirm which SQL files have been run.
create or replace function public.tbc_schema_version()
returns integer
language sql
stable
as $$ select 6 $$;

revoke all on function public.tbc_schema_version() from public, anon, authenticated;
grant execute on function public.tbc_schema_version() to service_role;
