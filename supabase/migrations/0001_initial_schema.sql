-- =============================================================================
-- THE BREAKFAST CLUB — initial database schema
--
-- Run this whole file once in the Supabase SQL Editor (or with `supabase db push`).
-- It is safe to run on a brand-new Supabase project.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.membership_status as enum ('active', 'past_due', 'cancelled', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('stripe', 'cash', 'zelle', 'venmo', 'cash_app', 'check', 'other');
exception when duplicate_object then null; end $$;

-- paid     = money received for the month
-- pending  = payment started but not yet confirmed (e.g. bank authentication)
-- failed   = a Stripe charge attempt failed
-- refunded = money was returned
-- void     = a manual entry the admin recorded by mistake (kept for audit history)
do $$ begin
  create type public.payment_status as enum ('paid', 'pending', 'failed', 'refunded', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.admin_role as enum ('owner', 'admin');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- club_settings — exactly one row (id = 1)
-- -----------------------------------------------------------------------------
create table if not exists public.club_settings (
  id                 smallint primary key default 1 check (id = 1),
  club_name          text        not null default 'The Breakfast Club',
  monthly_fee_cents  integer     not null default 2000 check (monthly_fee_cents > 0),
  payment_due_day    smallint    not null default 1 check (payment_due_day between 1 and 28),
  currency           text        not null default 'usd' check (currency = lower(currency) and length(currency) = 3),
  timezone           text        not null default 'America/New_York',
  admin_name         text,
  admin_email        text,
  admin_phone        text,
  updated_at         timestamptz not null default now()
);

insert into public.club_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists club_settings_updated_at on public.club_settings;
create trigger club_settings_updated_at
  before update on public.club_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- admin_users — who may access the admin area
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  email       text not null,
  role        public.admin_role not null default 'admin',
  created_at  timestamptz not null default now()
);

create unique index if not exists admin_users_email_key on public.admin_users (lower(email));

-- -----------------------------------------------------------------------------
-- members
-- -----------------------------------------------------------------------------
create table if not exists public.members (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid unique references auth.users (id) on delete set null,
  full_name               text not null check (length(trim(full_name)) > 0),
  email                   text not null check (position('@' in email) > 1),
  phone                   text,
  joined_date             date not null default current_date,
  membership_status       public.membership_status not null default 'active',
  ended_at                date,            -- set automatically when a member is cancelled / deactivated
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  subscription_status     text,            -- raw Stripe subscription status (active, past_due, canceled, ...)
  current_period_end      timestamptz,     -- when the current Stripe billing period ends (next charge)
  cancel_at_period_end    boolean not null default false,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists members_email_key on public.members (lower(email));
create index if not exists members_status_idx on public.members (membership_status);
create index if not exists members_name_idx on public.members (lower(full_name));

drop trigger if exists members_updated_at on public.members;
create trigger members_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- Keep ended_at in sync with membership_status.
create or replace function public.members_track_ended_at()
returns trigger
language plpgsql
as $$
begin
  if new.membership_status in ('cancelled', 'inactive') then
    new.ended_at = coalesce(new.ended_at, current_date);
  else
    new.ended_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists members_ended_at on public.members;
create trigger members_ended_at
  before insert or update of membership_status on public.members
  for each row execute function public.members_track_ended_at();

-- -----------------------------------------------------------------------------
-- payments — permanent monthly payment history
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id                        uuid primary key default gen_random_uuid(),
  member_id                 uuid references public.members (id) on delete set null,
  member_name               text not null,  -- snapshot so history survives a member being deleted
  amount_cents              integer not null check (amount_cents >= 0),
  currency                  text not null default 'usd',
  payment_month             smallint not null check (payment_month between 1 and 12),
  payment_year              smallint not null check (payment_year between 2000 and 2200),
  payment_date              timestamptz not null default now(),
  payment_method            public.payment_method not null,
  payment_status            public.payment_status not null default 'paid',
  stripe_payment_id         text unique,    -- Stripe invoice id (in_...). UNIQUE => webhook retries can never duplicate a payment
  stripe_payment_intent_id  text,
  notes                     text,
  recorded_by               uuid references auth.users (id) on delete set null,  -- admin who entered a manual payment
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- A member can only have ONE paid payment per month.
create unique index if not exists payments_one_paid_per_month
  on public.payments (member_id, payment_year, payment_month)
  where payment_status = 'paid' and member_id is not null;

create index if not exists payments_period_idx on public.payments (payment_year, payment_month);
create index if not exists payments_member_idx on public.payments (member_id, payment_year desc, payment_month desc);
create index if not exists payments_status_idx on public.payments (payment_status);

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- stripe_events — processed webhook event ids (idempotency)
-- -----------------------------------------------------------------------------
create table if not exists public.stripe_events (
  id            text primary key,   -- Stripe event id (evt_...)
  type          text not null,
  processed_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- notification_log — every notification sent (or attempted)
-- -----------------------------------------------------------------------------
create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references public.members (id) on delete cascade,
  type        text not null check (type in ('payment_confirmation', 'upcoming_payment_reminder', 'failed_payment_notice', 'past_due_reminder')),
  channel     text not null check (channel in ('email', 'sms', 'log')),
  dedupe_key  text not null,
  status      text not null check (status in ('sent', 'failed', 'skipped')),
  detail      text,
  created_at  timestamptz not null default now(),
  unique (dedupe_key, channel)
);

create index if not exists notification_log_member_idx on public.notification_log (member_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Helper: is the signed-in user an administrator?
-- SECURITY DEFINER so it can read admin_users regardless of RLS.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- New auth user => create (or link) their member record.
-- If an admin already added a member with the same email, the new login is
-- linked to that existing record instead of creating a duplicate.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id uuid;
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Reads:  members see only their own member row + their own payments;
--         admins see everything.
-- Writes: NO direct writes from the browser. All writes go through the app's
--         server code, which checks authorization and uses the service-role key.
-- -----------------------------------------------------------------------------
alter table public.club_settings    enable row level security;
alter table public.admin_users      enable row level security;
alter table public.members          enable row level security;
alter table public.payments         enable row level security;
alter table public.stripe_events    enable row level security;
alter table public.notification_log enable row level security;

drop policy if exists "settings readable by signed-in users" on public.club_settings;
create policy "settings readable by signed-in users"
  on public.club_settings for select to authenticated
  using (true);

drop policy if exists "admins read admin list; users read own row" on public.admin_users;
create policy "admins read admin list; users read own row"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "members read own row; admins read all" on public.members;
create policy "members read own row; admins read all"
  on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "members read own payments; admins read all" on public.payments;
create policy "members read own payments; admins read all"
  on public.payments for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.members m where m.id = payments.member_id and m.user_id = auth.uid())
  );

drop policy if exists "admins read notification log" on public.notification_log;
create policy "admins read notification log"
  on public.notification_log for select to authenticated
  using (public.is_admin());

-- stripe_events: no policies => only the service role can read/write it.

-- Belt and braces: the anon role never needs table access.
revoke all on public.club_settings, public.admin_users, public.members, public.payments,
              public.stripe_events, public.notification_log from anon;
