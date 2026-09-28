-- =============================================================================
-- Make yourself the first administrator.
--
-- 1. Register in the app at /register with YOUR email and confirm the email.
-- 2. Replace you@example.com below with that email (both places).
-- 3. Run this in Supabase → SQL Editor.
-- =============================================================================

insert into public.admin_users (user_id, email, role)
select id, lower(email), 'owner'
from auth.users
where lower(email) = lower('you@example.com')
on conflict (user_id) do update set role = 'owner';

-- Check it worked (should return one row):
select * from public.admin_users where lower(email) = lower('you@example.com');

-- OPTIONAL: if you are NOT a paying club member yourself, remove your member
-- record so you don't show up as UNPAID on the dashboard:
-- delete from public.members where lower(email) = lower('you@example.com');
