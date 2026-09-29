-- =============================================================================
-- THE BREAKFAST CLUB — payment coverage (allocations), $20 minimum, reminders
--
-- Run this in the Supabase SQL Editor AFTER 0004_verified_members_only.sql.
-- Safe to run more than once. Existing payments are kept and converted.
--
-- Key idea: money and membership coverage are kept separate.
--   payments             = money received (one row per transaction, even $240 for a year)
--   payment_allocations  = which months a payment covers (one row per month, full dues only)
-- A month is PAID only when an allocation exists for it. Voided or deleted payments
-- lose their allocations, so every total and status recalculates from the records.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Club settings: $20 minimum fee, payment reminder settings
-- -----------------------------------------------------------------------------
-- Monthly membership is at least $20.
update public.club_settings set monthly_fee_cents = 2000 where monthly_fee_cents < 2000;
alter table public.club_settings drop constraint if exists club_settings_monthly_fee_cents_check;
alter table public.club_settings drop constraint if exists club_settings_min_fee;
alter table public.club_settings add constraint club_settings_min_fee check (monthly_fee_cents >= 2000);

alter table public.club_settings add column if not exists reminders_enabled boolean not null default true;
alter table public.club_settings add column if not exists reminder_days_before smallint[] not null default '{3,1,0}';
alter table public.club_settings add column if not exists overdue_enabled boolean not null default false;
alter table public.club_settings add column if not exists overdue_days_after smallint[] not null default '{1,3,7}';
alter table public.club_settings add column if not exists sms_enabled boolean not null default true;
alter table public.club_settings add column if not exists email_enabled boolean not null default true;
alter table public.club_settings add column if not exists push_enabled boolean not null default true;
alter table public.club_settings add column if not exists reminder_message text;
alter table public.club_settings add column if not exists overdue_message text;

-- -----------------------------------------------------------------------------
-- Members: reminder preference, optional personal dues and due day
-- -----------------------------------------------------------------------------
alter table public.members add column if not exists notification_pref text not null default 'all';
alter table public.members drop constraint if exists members_notification_pref_check;
alter table public.members add constraint members_notification_pref_check
  check (notification_pref in ('sms', 'email', 'push', 'sms_email', 'all', 'none'));

alter table public.members add column if not exists dues_cents integer;
alter table public.members drop constraint if exists members_dues_min;
alter table public.members add constraint members_dues_min check (dues_cents is null or dues_cents >= 2000);

alter table public.members add column if not exists due_day smallint;
alter table public.members drop constraint if exists members_due_day_range;
alter table public.members add constraint members_due_day_range check (due_day is null or due_day between 1 and 28);

-- -----------------------------------------------------------------------------
-- Payments: what the money was for
--   payment_month / payment_year = first month the payment covers
--                                  (for a donation-only payment: the month received)
--   months_count  = how many full months it covers (0 for a donation / other)
--   extra_cents   = money beyond whole months (never a partial month)
-- -----------------------------------------------------------------------------
alter table public.payments add column if not exists category text not null default 'dues';
alter table public.payments drop constraint if exists payments_category_check;
alter table public.payments add constraint payments_category_check
  check (category in ('dues', 'prepayment', 'donation', 'other'));

alter table public.payments add column if not exists months_count smallint not null default 1;
alter table public.payments drop constraint if exists payments_months_count_check;
alter table public.payments add constraint payments_months_count_check check (months_count between 0 and 120);

alter table public.payments add column if not exists extra_cents integer not null default 0;
alter table public.payments drop constraint if exists payments_extra_cents_check;
alter table public.payments add constraint payments_extra_cents_check check (extra_cents >= 0);

alter table public.payments add column if not exists extra_category text;
alter table public.payments drop constraint if exists payments_extra_category_check;
alter table public.payments add constraint payments_extra_category_check
  check (extra_category is null or extra_category in ('donation', 'credit', 'other'));

-- The absolute minimum payment is $20. Checked for every NEW payment (and any change
-- to an amount); older records are left as they were so they can still be voided.
alter table public.payments drop constraint if exists payments_min_amount;
create or replace function public.payments_enforce_minimum()
returns trigger
language plpgsql
as $$
begin
  if new.amount_cents < 2000 and (tg_op = 'INSERT' or new.amount_cents <> old.amount_cents) then
    raise exception 'MIN_AMOUNT: Minimum payment amount is $20.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists payments_min_amount on public.payments;
create trigger payments_min_amount
  before insert or update of amount_cents on public.payments
  for each row execute function public.payments_enforce_minimum();

-- One payment can now cover several months, so "one paid payment per month" moves
-- to the allocations table below.
drop index if exists public.payments_one_paid_per_month;

-- -----------------------------------------------------------------------------
-- payment_allocations: which months each payment covers
-- -----------------------------------------------------------------------------
create table if not exists public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  period_year   smallint not null check (period_year between 2000 and 2200),
  period_month  smallint not null check (period_month between 1 and 12),
  amount_cents  integer not null check (amount_cents >= 2000),
  created_at    timestamptz not null default now(),
  unique (member_id, period_year, period_month)   -- a month can only be paid once
);

create index if not exists payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index if not exists payment_allocations_period_idx on public.payment_allocations (period_year, period_month);

alter table public.payment_allocations enable row level security;
drop policy if exists "members read own allocations; admins read all" on public.payment_allocations;
create policy "members read own allocations; admins read all"
  on public.payment_allocations for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.members m where m.id = payment_allocations.member_id and m.user_id = auth.uid())
  );
revoke all on public.payment_allocations from anon;

-- Existing paid payments each covered one month: give them their allocation.
-- (Only full payments of at least $20: there are no partly-paid months.)
insert into public.payment_allocations (payment_id, member_id, period_year, period_month, amount_cents)
select p.id, p.member_id, p.payment_year, p.payment_month, p.amount_cents
from public.payments p
where p.payment_status = 'paid' and p.member_id is not null and p.amount_cents >= 2000
on conflict (member_id, period_year, period_month) do nothing;

-- -----------------------------------------------------------------------------
-- Notification history: who, where, which month, scheduled day
-- -----------------------------------------------------------------------------
alter table public.notification_log add column if not exists recipient text;
alter table public.notification_log add column if not exists period_year smallint;
alter table public.notification_log add column if not exists period_month smallint;
alter table public.notification_log add column if not exists scheduled_for date;

alter table public.notification_log drop constraint if exists notification_log_type_check;
alter table public.notification_log add constraint notification_log_type_check check (type in (
  'payment_confirmation', 'upcoming_payment_reminder', 'failed_payment_notice', 'past_due_reminder',
  'manual_reminder',
  'admin_zelle_reported', 'admin_payment_failed', 'admin_overdue_summary', 'admin_monthly_summary', 'admin_test'
));
alter table public.notification_log drop constraint if exists notification_log_channel_check;
alter table public.notification_log add constraint notification_log_channel_check
  check (channel in ('email', 'sms', 'push', 'log'));

create index if not exists notification_log_created_idx on public.notification_log (created_at desc);

-- -----------------------------------------------------------------------------
-- Push notification subscriptions (members who installed the app and allowed notifications)
-- -----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_member_idx on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "members read own push subscriptions; admins read all" on public.push_subscriptions;
create policy "members read own push subscriptions; admins read all"
  on public.push_subscriptions for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.members m where m.id = push_subscriptions.member_id and m.user_id = auth.uid())
  );
revoke all on public.push_subscriptions from anon;

-- =============================================================================
-- Payment operations. Each runs as ONE database transaction, so the payment and
-- the months it covers can never get out of step. Only the app's server calls
-- these (service role); members and browsers cannot.
-- =============================================================================

-- A member's monthly dues: their own amount, or the club's.
create or replace function public.tbc_member_dues(p_member uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(m.dues_cents, s.monthly_fee_cents, 2000)
  from public.members m, public.club_settings s
  where m.id = p_member and s.id = 1;
$$;

-- Cover p_months months for a payment, starting at the given month and skipping
-- months that are already paid. Returns how many months were covered.
create or replace function public.tbc_allocate(
  p_payment uuid, p_member uuid, p_start_year integer, p_start_month integer, p_months integer, p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  y integer := p_start_year;
  m integer := p_start_month;
  n integer := 0;
  guard integer := 0;
begin
  while n < p_months and guard < 600 loop
    insert into public.payment_allocations (payment_id, member_id, period_year, period_month, amount_cents)
    values (p_payment, p_member, y, m, p_amount)
    on conflict (member_id, period_year, period_month) do nothing;
    if found then
      n := n + 1;
    end if;
    m := m + 1;
    if m > 12 then m := 1; y := y + 1; end if;
    guard := guard + 1;
  end loop;
  return n;
end;
$$;

-- Record a payment (and cover its months) in one step.
--   p_months  full months the payment covers (0 = donation / other, no months)
--   p_exact   true: the months starting at p_start must all be unpaid (used by the
--             one-tap "Paid" button); false: already-paid months are skipped.
-- Errors (the app shows friendly text for these):
--   MIN_AMOUNT        amount below $20
--   NOT_ENOUGH        amount doesn't cover the requested whole months
--   ALREADY_PAID      p_exact and a requested month is already paid
--   MEMBER_NOT_FOUND
create or replace function public.tbc_record_payment(
  p_member uuid,
  p_amount integer,
  p_method public.payment_method,
  p_status public.payment_status,
  p_date timestamptz,
  p_months integer,
  p_start_year integer,
  p_start_month integer,
  p_category text,
  p_extra_category text,
  p_notes text,
  p_recorded_by uuid,
  p_exact boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_dues integer;
  v_id uuid;
  y integer := p_start_year;
  m integer := p_start_month;
  i integer;
begin
  if p_amount < 2000 then
    raise exception 'MIN_AMOUNT';
  end if;
  select * into v_member from public.members where id = p_member;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  v_dues := public.tbc_member_dues(p_member);
  if p_months < 0 or p_months * v_dues > p_amount then
    raise exception 'NOT_ENOUGH';
  end if;

  if p_exact and p_months > 0 then
    for i in 1..p_months loop
      if exists (select 1 from public.payment_allocations a
                 where a.member_id = p_member and a.period_year = y and a.period_month = m) then
        raise exception 'ALREADY_PAID';
      end if;
      m := m + 1;
      if m > 12 then m := 1; y := y + 1; end if;
    end loop;
  end if;

  insert into public.payments (
    member_id, member_name, amount_cents, currency, payment_month, payment_year, payment_date,
    payment_method, payment_status, notes, recorded_by, category, months_count, extra_cents, extra_category
  )
  select
    p_member, v_member.full_name, p_amount, s.currency, p_start_month, p_start_year, p_date,
    p_method, p_status, nullif(trim(coalesce(p_notes, '')), ''), p_recorded_by, p_category, p_months,
    p_amount - p_months * v_dues,
    case when p_amount - p_months * v_dues > 0 then coalesce(p_extra_category, 'donation') else null end
  from public.club_settings s where s.id = 1
  returning id into v_id;

  if p_status = 'paid' and p_months > 0 then
    perform public.tbc_allocate(v_id, p_member, p_start_year, p_start_month, p_months, v_dues);
  end if;

  if p_status = 'paid' and v_member.membership_status = 'past_due' and v_member.stripe_subscription_id is null then
    update public.members set membership_status = 'active' where id = p_member;
  end if;

  return v_id;
end;
$$;

-- Confirm a member-reported (pending) payment: it becomes paid and covers its months.
create or replace function public.tbc_confirm_payment(p_payment uuid, p_admin uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.payments;
  v_covered integer := 0;
begin
  update public.payments
     set payment_status = 'paid', recorded_by = p_admin
   where id = p_payment and payment_status = 'pending'
  returning * into v;
  if not found then
    return -1;
  end if;
  if v.member_id is not null and v.months_count > 0 then
    v_covered := public.tbc_allocate(
      v.id, v.member_id, v.payment_year, v.payment_month, v.months_count, public.tbc_member_dues(v.member_id));
  end if;
  return v_covered;
end;
$$;

-- Void: keep the record (marked void) but it no longer counts as money or covers any month.
create or replace function public.tbc_void_payment(p_payment uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  update public.payments
     set payment_status = 'void',
         notes = concat_ws(' — ', nullif(notes, ''), coalesce(p_note, 'Voided by admin'))
   where id = p_payment and payment_status in ('paid', 'pending')
  returning member_id into v_member;
  delete from public.payment_allocations where payment_id = p_payment;
  return v_member;
end;
$$;

-- Restore a voided payment: it counts again and covers its months again
-- (starting where it originally started, skipping months paid since).
create or replace function public.tbc_restore_payment(p_payment uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.payments;
  v_covered integer := 0;
begin
  update public.payments
     set payment_status = 'paid',
         notes = concat_ws(' — ', nullif(notes, ''), 'Restored by admin')
   where id = p_payment and payment_status = 'void'
  returning * into v;
  if not found then
    return -1;
  end if;
  if v.member_id is not null and v.months_count > 0 then
    v_covered := public.tbc_allocate(
      v.id, v.member_id, v.payment_year, v.payment_month, v.months_count, public.tbc_member_dues(v.member_id));
  end if;
  return v_covered;
end;
$$;

-- Delete a payment completely (its month coverage goes with it).
create or replace function public.tbc_delete_payment(p_payment uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  delete from public.payments where id = p_payment returning member_id into v_member;
  return v_member;
end;
$$;

-- Wipe ALL payment history (payments and month coverage). Members are kept.
create or replace function public.tbc_wipe_payment_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.payment_allocations where true;
  delete from public.payments where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Lets /setup-check confirm which SQL files have been run.
create or replace function public.tbc_schema_version()
returns integer
language sql
stable
as $$ select 5 $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'tbc_member_dues(uuid)',
    'tbc_allocate(uuid, uuid, integer, integer, integer, integer)',
    'tbc_record_payment(uuid, integer, public.payment_method, public.payment_status, timestamptz, integer, integer, integer, text, text, text, uuid, boolean)',
    'tbc_confirm_payment(uuid, uuid)',
    'tbc_void_payment(uuid, text)',
    'tbc_restore_payment(uuid)',
    'tbc_delete_payment(uuid)',
    'tbc_wipe_payment_history()',
    'tbc_schema_version()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
