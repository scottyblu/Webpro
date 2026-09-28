-- =============================================================================
-- THE BREAKFAST CLUB — only verified accounts become members
--
-- Run this in the Supabase SQL Editor AFTER 0003_admin_notifications.sql.
-- Safe to run more than once.
--
-- Before: a member record was created the moment someone signed up.
-- After:  it is created (or linked to one an admin added) only once they
--         confirm their email, so unverified sign-ups never appear in the
--         members list or the paid / unpaid counts.
-- =============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id uuid;
begin
  -- Wait until the email address is confirmed.
  if new.email_confirmed_at is null then
    return new;
  end if;

  -- Already has a member record (e.g. linked earlier): nothing to do.
  if exists (select 1 from public.members where user_id = new.id) then
    return new;
  end if;

  update public.members
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null
  returning id into linked_id;

  if linked_id is null and coalesce(new.raw_user_meta_data ->> 'skip_member', 'false') <> 'true' then
    insert into public.members (user_id, full_name, email, phone)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
      new.email,
      nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- New sign-ups (already confirmed, e.g. created by an admin) ...
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ... and people who confirm their email later.
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_auth_user();

-- Clean up: remove member records created for sign-ups that never confirmed
-- their email (only if they have no payment history).
delete from public.members m
using auth.users u
where m.user_id = u.id
  and u.email_confirmed_at is null
  and not exists (select 1 from public.payments p where p.member_id = m.id);

-- Lets the app's /setup-check page confirm this file has been run.
create or replace function public.tbc_schema_version()
returns integer
language sql
stable
as $$ select 4 $$;

revoke all on function public.tbc_schema_version() from public;
grant execute on function public.tbc_schema_version() to service_role;
