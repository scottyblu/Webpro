# THE BREAKFAST CLUB

A membership-dues app for a private club. Members pay **$20/month** by **Zelle** (and optionally by card through Stripe); the administrator opens the dashboard and immediately sees **who paid this month and who still owes**.

> **Zelle only?** Skip [section 3](#3-stripe-setup) and leave the Stripe variables empty. After you're signed in as admin, open **Settings → Zelle** and enter the Zelle name and email/phone members should pay. Members see a **Pay with Zelle** card, tap **"I've sent my Zelle payment"**, and show as **PENDING** until you tap **Received** on your dashboard.

- **Members**: register, log in, see PAID / UNPAID for the current month, pay with Stripe Checkout (auto-renews monthly), manage their card in the Stripe Customer Portal, cancel, see payment history and next due date, edit their profile.
- **Admins**: dashboard with Total Members / Paid / Unpaid / Collected / Expected, searchable + filterable payment table, any-month view, manual payments (Cash, Zelle, Venmo, Cash App, Check, Other) with notes, add / edit / deactivate / reactivate / delete members, member profiles with full payment history, reports with charts, CSV export, settings.
- **Automatic**: Stripe webhooks update the database after every payment, failure and cancellation. Duplicate webhook deliveries can never create duplicate payments.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth) · Stripe (Checkout, Billing, Customer Portal, Webhooks)

---

## Contents

1. [Supabase setup](#1-supabase-setup)
2. [Database SQL](#2-database-sql)
3. [Stripe setup](#3-stripe-setup)
4. [Environment variables](#4-environment-variables)
5. [Run locally](#5-run-locally)
6. [Deploy](#6-deploy-to-vercel)
7. [Create the first administrator](#7-create-the-first-administrator)
8. [Install it as a phone app](#8-install-it-as-a-phone-app)
9. [How it works](#how-it-works)
10. [Project structure](#project-structure)

---

## 1. Supabase setup

1. Go to <https://supabase.com/dashboard> → **New project**. Pick a name (e.g. `breakfast-club`), a strong database password, and the region closest to you. Wait for it to finish provisioning.
2. **Create the database**: left sidebar → **SQL Editor** → **New query** → paste the entire contents of [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) → **Run**. You should see “Success. No rows returned”. Then do the same with [`0002_zelle_payments.sql`](supabase/migrations/0002_zelle_payments.sql), [`0003_admin_notifications.sql`](supabase/migrations/0003_admin_notifications.sql) and [`0004_verified_members_only.sql`](supabase/migrations/0004_verified_members_only.sql). (See [section 2](#2-database-sql).)
3. **Copy your keys**: **Project Settings** (gear icon) →
   - **Data API** → *Project URL* → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **API Keys** → the *anon / public* key (or a *publishable* key, `sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **API Keys** → the *service_role* key (or a *secret* key, `sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY` — **server only, never share it**
4. **Auth URLs**: **Authentication → URL Configuration**
   - **Site URL**: `http://localhost:3000` for now (change to your real domain after deploying)
   - **Redirect URLs** → add both:
     - `http://localhost:3000/**`
     - `https://YOUR-DOMAIN/**` (add once you know your production domain)
5. **Email confirmation (required)**: **Authentication → Sign In / Providers → Email** → turn **Confirm email** **ON** → **Save**. Without it, people can use the app without proving they own their email. While you're there, set **Minimum password length** to `10` and **Password requirements** to *Lowercase, uppercase letters, digits and symbols* (the app enforces the same rules). `/setup-check` shows a red ✗ if Confirm email is off.
6. **Email templates** (required for invitations; recommended for all): **Authentication → Emails → Templates**. In each template below, replace the link (`{{ .ConfirmationURL }}`) with the one shown:

   | Template | Link to use |
   | --- | --- |
   | Confirm signup | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
   | Invite user | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password` |
   | Reset password | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |

   Example body for **Invite user**:
   ```html
   <h2>You're invited to The Breakfast Club</h2>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">Accept the invitation and choose a password</a></p>
   ```
7. **Send sign-up emails from your Gmail (recommended)**: by default Supabase sends confirmation and password-reset emails from its own address, limited to a few per hour. To send them from the club Gmail instead: **Authentication → Emails → SMTP Settings** → turn on **Enable custom SMTP** and enter:
   - Sender email: your club Gmail (same as `GMAIL_ADDRESS`)
   - Sender name: `The Breakfast Club`
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: your club Gmail · Password: the 16-letter Gmail app password (same as `GMAIL_APP_PASSWORD`)

   Then **Save**. Under **Authentication → Rate Limits**, you can raise "emails per hour" (for example to 30).

## 2. Database SQL

The complete schema is in two files. Run them **in order** in the Supabase SQL Editor (both are safe to re-run):

1. **[`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)**: all tables, security and triggers
2. **[`supabase/migrations/0002_zelle_payments.sql`](supabase/migrations/0002_zelle_payments.sql)**: Zelle settings, plus a rule that a member can report only one Zelle payment per month while it waits for confirmation
3. **[`supabase/migrations/0003_admin_notifications.sql`](supabase/migrations/0003_admin_notifications.sql)**: the admin “Notification emails” list
4. **[`supabase/migrations/0004_verified_members_only.sql`](supabase/migrations/0004_verified_members_only.sql)**: people only become members after confirming their email (unconfirmed sign-ups never appear in the members list)
5. **[`supabase/migrations/0005_allocations_and_reminders.sql`](supabase/migrations/0005_allocations_and_reminders.sql)**: multi-month / yearly / custom payments (`payment_allocations`), the $20 minimum, void / restore / delete / wipe functions, member reminder preferences, reminder settings and app (push) notification subscriptions. Existing payments are kept and converted.
6. **[`supabase/migrations/0006_club_logo.sql`](supabase/migrations/0006_club_logo.sql)**: the firehouse logo uploaded in Settings (login screen, menu and app icon)
7. **[`supabase/migrations/0007_venmo.sql`](supabase/migrations/0007_venmo.sql)**: the Venmo username members pay (Settings → Venmo)

Together they create:

| Table | Purpose |
| --- | --- |
| `members` | full_name, email, phone, joined_date, membership_status (`active`/`past_due`/`cancelled`/`inactive`), stripe_customer_id, stripe_subscription_id, subscription status, current period end, notes, created_at |
| `payments` | member_id, amount_cents, payment_month, payment_year, payment_date, payment_method (`stripe`/`cash`/`zelle`/`venmo`/`cash_app`/`check`/`other`), payment_status (`paid`/`pending`/`failed`/`refunded`/`void`), stripe_payment_id, notes, recorded_by, created_at |
| `admin_users` | user_id, email, role (`owner`/`admin`), created_at |
| `club_settings` | one row: club name, monthly fee, due day, currency, time zone, admin contact |
| `stripe_events` | processed Stripe event ids (webhook idempotency) |
| `notification_log` | every notification sent, with a de-duplication key |

Key protections built into the database:

- **No duplicate Stripe payments**: `payments.stripe_payment_id` (the Stripe invoice id) is `UNIQUE`, and processed webhook event ids are stored in `stripe_events`.
- **A month can only be paid once**: `payment_allocations` is unique on `(member_id, period_year, period_month)`. One payment (e.g. $240 for a year) has one allocation row per month it covers, each a full month of dues — there are no partial months.
- **$20 minimum**: every new payment is checked in the app (browser and server) and again by the database.
- **Permanent history**: deleting a member sets `payments.member_id` to `NULL` and keeps the payment (with the member’s name) — revenue reports stay correct. Deactivating never touches payments.
- **Row Level Security** on every table: members can read only their own member row and payments; admins (via `is_admin()`) can read everything; the browser can’t write anything directly — all writes go through server code that checks authorization first.
- **Automatic account linking**: once someone confirms their email, a trigger on `auth.users` creates their member record, or links their login to an existing member the admin already added with the same email. Unconfirmed sign-ups never become members.
- **One account per email**: sign-up is refused when the mailbox already has an account (Gmail addresses are compared ignoring dots and "+tags"). Passwords need 10+ characters with upper- and lowercase letters, a number and a symbol.

Amounts are stored in cents (`2000` = $20.00) to avoid rounding errors.

## 3. Stripe setup

**Optional.** Stripe adds automatic monthly card payments. If you only use Zelle (and cash), skip this whole section and leave the Stripe environment variables empty: the card buttons disappear automatically. You can add Stripe any time later.

Do everything in **Test mode** first (toggle at the top of the Stripe Dashboard).

1. **Create an account** at <https://dashboard.stripe.com/register>.
2. **Secret key**: **Developers → API keys** → *Secret key* → **Reveal** → copy `sk_test_…` into `STRIPE_SECRET_KEY`.
3. **Customer Portal** (lets members update their card / cancel): **Settings → Billing → Customer portal** (<https://dashboard.stripe.com/test/settings/billing/portal>):
   - Turn on **Customers can update payment methods**
   - Turn on **Customers can view invoice history**
   - Turn on **Customers can cancel subscriptions** → choose **At the end of the billing period**
   - Click **Save**. (The portal won’t open until this configuration has been saved once in each mode.)
4. **Webhook** (keeps the database in sync): **Developers → Webhooks → Add endpoint** (or *Create an event destination* → *Webhook endpoint*, with **Snapshot** payloads):
   - **Endpoint URL**: `https://YOUR-DOMAIN/api/stripe/webhook`
   - **Events to send** — select exactly these:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `invoice.payment_action_required`
   - Save, then copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
   - For **local development** you don’t need this dashboard endpoint — use the Stripe CLI (see [section 5](#5-run-locally)).
5. **Failed payment retries**: **Settings → Billing → Subscriptions and emails** (<https://dashboard.stripe.com/settings/billing/automatic>):
   - Enable **Smart Retries**.
   - Under “If all retries for a payment fail”, choose **Cancel the subscription** (the app will then mark the member CANCELLED) or **Mark the subscription as unpaid** (member stays PAST DUE).
   - Optionally enable Stripe’s own customer emails for failed payments and expiring cards.
6. **Price (optional)**: by default Checkout charges the *Monthly Membership Fee* from the app’s Settings page ($20). If you prefer a fixed Stripe product, go to **Product catalog → Add product** → name “The Breakfast Club Membership”, **Recurring**, **$20.00 USD**, **Monthly** → Save → copy the price id (`price_…`) into `STRIPE_PRICE_ID`.
7. **Test it**: pay from a member dashboard with card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP. To test a failed renewal, use a [test clock](https://dashboard.stripe.com/test/billing/subscriptions/test-clocks) or subscribe with `4000 0000 0000 0341` (attaches fine, then fails when charged).
8. **Going live**: switch the Dashboard to Live mode and repeat steps 2–5 there (live mode has its own keys, portal settings and webhook endpoint), then replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in your hosting environment with the live values and redeploy.

## 4. Environment variables

Copy [`.env.example`](.env.example) to `.env.local` and fill in:

| Variable | Required | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | `http://localhost:3000` locally; `https://your-domain.com` in production |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Project Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase → Project Settings → API Keys → anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase → Project Settings → API Keys → service_role / secret key (**server only**) |
| `STRIPE_SECRET_KEY` | only for card payments | Stripe → Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | only for card payments | Stripe → Developers → Webhooks → endpoint → Signing secret (or `stripe listen` output locally) |
| `STRIPE_PRICE_ID` | no | Stripe → Product catalog → your monthly price (`price_…`). Leave empty to use the fee from Settings |
| `CRON_SECRET` | yes for reminders | Any long random string: `openssl rand -hex 32` |
| `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` | recommended | The Gmail account that sends all emails, plus its app password (see [Email setup](#email-setup-gmail)) |
| `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL` | no | Alternative to Gmail: <https://resend.com> → API Keys; the from-address must be on a domain verified in Resend |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | no (text reminders) | <https://console.twilio.com> → Account Info; a Twilio phone number (Secret) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | no (app notifications) | Admin → Settings → App notifications → **Create app notification keys**. Public key = Config, private key = Secret |
| `VAPID_SUBJECT` | no | Contact for push services, e.g. `mailto:you@example.com` (defaults to `GMAIL_ADDRESS`) |

No API key is hardcoded anywhere. The admin **Settings** page shows which integrations are connected.

## 5. Run locally

Requirements: **Node.js 20+** and the **Stripe CLI** (<https://docs.stripe.com/stripe-cli>).

```bash
npm install
cp .env.example .env.local        # then fill in the values (section 4)
npm run dev                       # http://localhost:3000
```

In a second terminal, forward Stripe webhooks to your machine:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

`stripe listen` prints a signing secret (`whsec_…`) — put it in `STRIPE_WEBHOOK_SECRET` in `.env.local` and restart `npm run dev`.

Other scripts: `npm run build` (production build, includes type-check and lint), `npm run start`, `npm run lint`, `npm run typecheck`.

## 6. Deploy to Vercel

1. Push this repository to GitHub.
2. Go to <https://vercel.com/new> → **Import** the repository. Framework preset: **Next.js** (auto-detected). Leave build settings as default.
3. **Environment Variables**: add every variable from [section 4](#4-environment-variables). Set `NEXT_PUBLIC_SITE_URL` to your production URL (e.g. `https://breakfast-club.vercel.app` or your custom domain). Use your **live** Stripe keys when you’re ready for real payments.
4. Click **Deploy**.
5. After the first deploy:
   - **Supabase → Authentication → URL Configuration**: set **Site URL** to your production URL and add `https://YOUR-DOMAIN/**` to Redirect URLs.
   - **Stripe → Webhooks**: create the endpoint `https://YOUR-DOMAIN/api/stripe/webhook` ([section 3, step 4](#3-stripe-setup)) and put its signing secret in Vercel’s `STRIPE_WEBHOOK_SECRET`. Then **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the new value is picked up.
6. **Reminders**: [`vercel.json`](vercel.json) schedules `/api/cron/reminders` daily at 14:00 UTC. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`, so just make sure `CRON_SECRET` is set. (Anywhere else, call `GET /api/cron/reminders` daily with that header.)
7. **Custom domain** (optional): Vercel → Project → Settings → Domains. Update `NEXT_PUBLIC_SITE_URL`, the Supabase URLs and the Stripe webhook URL to match.

Any Node.js host that runs Next.js works (Netlify, Render, Railway, a VPS with `npm run build && npm run start`); schedule the reminder URL with that platform’s cron.

## 7. Create the first administrator

1. Open the app and **register** at `/register` with your own email. Confirm your email from the message Supabase sends.
2. In Supabase → **SQL Editor**, run [`supabase/create_first_admin.sql`](supabase/create_first_admin.sql) after replacing `you@example.com` with your email:
   ```sql
   insert into public.admin_users (user_id, email, role)
   select id, lower(email), 'owner'
   from auth.users
   where lower(email) = lower('you@example.com')
   on conflict (user_id) do update set role = 'owner';
   ```
   If you are **not** a paying member yourself, also run
   `delete from public.members where lower(email) = lower('you@example.com');`
   so you don’t appear as UNPAID.
3. Sign out and sign back in — you’ll land on `/admin`.
4. Add more administrators later from **Settings → Administrators** (they must register first).

### Email setup (Gmail)

Without this, the app works but sends no emails. With it, members get payment confirmations and reminders, and the addresses in **Settings → Notification emails** get admin alerts:
- when a member reports a Zelle payment
- a list of who still owes, a few days after the due date
- a summary at the start of each month

1. Pick the Gmail account that will send the emails. A new one just for the club, like `breakfastclub.dues@gmail.com`, is best.
2. Signed in to that account, go to <https://myaccount.google.com/security> and turn on **2-Step Verification**.
3. Go to <https://myaccount.google.com/apppasswords>, type a name like `Breakfast Club app`, and click **Create**. Google shows a 16-letter password like `abcd efgh ijkl mnop`. Copy it.
4. In Vercel → your project → **Settings → Environment Variables**, add:
   - `GMAIL_ADDRESS` = the Gmail address
   - `GMAIL_APP_PASSWORD` = the 16-letter app password (spaces are fine)
5. **Deployments** → ⋯ → **Redeploy**.
6. In the app: **Settings → Notification emails**, enter who should get alerts (one per line), then **Save settings** and **Send test email**.

Scheduled alerts (overdue list, monthly summary, member reminders) run from the daily job, which needs `CRON_SECRET` set in Vercel.

## 8. Install it as a phone app

The Breakfast Club is an installable app (a Progressive Web App). Once it’s deployed, members and admins add it to their home screen. It gets its own icon, opens full-screen with no browser bar, and uses bottom tabs like a normal app. There’s no app store and no fee, and every update you deploy reaches everyone right away.

- **iPhone / iPad**: open your app’s address in **Safari** → tap **Share** → **Add to Home Screen** → **Add**.
- **Android**: open the address in **Chrome** → tap **Install app** on the banner (or ⋮ menu → **Install app** / **Add to Home screen**).
- **Computer (Chrome / Edge)**: click the install icon at the right of the address bar.

The app shows a “Get the Breakfast Club app” card with these steps until it’s installed (or dismissed). Tip: send members your app address in a text with the line “Open in Safari/Chrome and tap Add to Home Screen.”

Notes:
- The app must be served over **https** to be installable (Vercel does this automatically).
- On iPhone, the installed app keeps its own login, separate from Safari, so members sign in once inside the app. Links in emails (confirm account, reset password) open in Safari. After using one, open the app and sign in.
- Payment and member data are never stored on the phone. The app always loads live data, and shows a friendly “You’re offline” screen with no connection.

---

## How it works

**Money vs. months covered.** A payment is money received (one row, even for $240). Its `payment_allocations` rows say which months it covers — one full month of dues each. Totals are never stored; every screen recalculates them from these records, so adding, voiding, restoring or deleting a payment updates everything immediately.

- *Amount Collected / monthly revenue* = valid (not voided) payments **received** that month (cash basis). A $240 yearly payment made in September is $240 of September revenue.
- *Paid through* = the last month of the unbroken run of covered months.
- Payment options: **One month** ($20), **Multiple months**, **Full year** ($240, 12 months, status PAID AHEAD) or **Custom amount** (at least $20). Whole months only: $50 covers 2 months and the $10 left is recorded as a donation, unallocated credit or other — never a partly-paid month. Amounts under $20 are rejected in the browser, on the server and in the database.
- **Void** keeps the record (marked Voided) but removes its money and its months; **Restore** undoes that; **Delete** removes it permanently; **Wipe History** (Payments page) deletes every payment but keeps members.

For any month, each member is:

| Status | Meaning |
| --- | --- |
| **PAID** (green) | that month is covered by a valid payment |
| **PAID AHEAD** (teal) | this month and the next are covered (prepaid) |
| **PENDING** (yellow) | the member reported a Zelle payment that isn't confirmed yet |
| **UNPAID** (red) | not covered, due date not reached yet |
| **OVERDUE** (dark red) | not covered and the due date has passed |
| **CANCELLED** (gray) | the member was cancelled/deactivated |

**Payment reminders.** Settings → Payment reminders: automatic reminders N days before the due date (default 3, 1 and 0), optional overdue reminders N days after (default 1, 3, 7), which channels to use (text, email, app) and custom messages. Each member picks their preference (Text / Email / App / Text + Email / All / None) on their profile. A daily job (`/api/cron/reminders`) sends a reminder only for months that are still unpaid, so paying stops them and voiding a payment restarts them. Each reminder is sent once per member + month + type + day. Admins can also tap **Send reminder** on a member's profile. Everything sent is listed under **Settings → Notification history** (`/admin/notifications`) and on each member's profile. App notifications use the standard Web Push protocol (no extra service); members turn them on from their dashboard after installing the app.

**Venmo.** Settings → Venmo username adds a **Pay on Venmo** button that opens the Venmo app with the amount and a note already filled in. Members then tap **I've sent my Venmo payment**, which works exactly like the Zelle flow below.

**Zelle flow.** Settings → Zelle holds the recipient name and Zelle email/phone. Members see those details, a ready-made memo (“Breakfast Club – September 2026 – Mike Jones”) and an **“I’ve sent my Zelle payment”** button, which records a PENDING Zelle payment for the month. The admin dashboard lists these under **Waiting for confirmation**. **Received** makes it PAID (and sends a confirmation); **Not received** voids it (kept in history) and the member can report again. Zelle has no way for apps to see payments, so this confirmation step is what keeps the records accurate. Reminder messages include the Zelle details.

**Stripe flow (optional).** *Pay* → Stripe Checkout (subscription, $20/month) → Stripe charges the card → `invoice.paid` webhook → a `paid` payment row for that month. Each renewal creates the next month’s row automatically. A failed renewal records a `failed` row, marks the member PAST DUE and sends a failed-payment notice; a later successful retry flips it to paid. If a member already paid a month another way (cash), a Stripe payment for that month is applied to the next unpaid month instead of being lost.

**Next payment date.** Auto-pay members: the next Stripe charge date. Everyone else: the due day (Settings) of the earliest unpaid month.

**Security.** `/admin`, `/member-management`, `/payment-management` and `/reports` are protected three times on the server: in middleware, in the admin layout, and in every server action / API route (`requireAdmin()`). The database’s Row Level Security additionally prevents members from reading anyone else’s data even if they call Supabase directly. Card numbers never touch this app — Stripe Checkout and the Customer Portal handle them.

**Notifications.** [`src/lib/notifications`](src/lib/notifications) contains the member messages (payment confirmation, upcoming payment reminder, failed payment notice, past-due reminder), their wording (`templates.ts`), and the admin alerts (`notifyAdmins`: Zelle payment reported, card payment failed, overdue list, monthly summary) sent to **Settings → Notification emails**. Providers switch on automatically when their env vars are set: email via Gmail (or Resend) and SMS via Twilio. Every notification is also logged. Sending is de-duplicated through `notification_log`. To use another provider, add a file in `providers/` implementing `NotificationProvider` and register it in `index.ts`.

## Project structure

```
src/
  middleware.ts                    session refresh + server-side route protection
  app/
    page.tsx                       landing page (redirects signed-in users)
    manifest.ts                    app manifest (name, icons, full-screen)
    login/ register/ forgot-password/ reset-password/
    auth/callback/route.ts         email link handler (confirm, invite, reset)
    auth/signout/route.ts
    dashboard/                     MEMBER: status, pay, history, profile
    (admin)/layout.tsx             admin gate + sidebar
    (admin)/admin/                 ADMIN dashboard  (/admin)
    (admin)/admin/settings/        settings + administrators
    (admin)/member-management/     member list, add, profile/edit/manual payment
    (admin)/payment-management/    any-month view
    (admin)/reports/               revenue reports + charts
    actions/                       server actions (auth, profile, members, payments, settings)
    api/stripe/checkout/           start Checkout  (+ /success sync)
    api/stripe/portal/             open Customer Portal
    api/stripe/cancel/             member cancels at period end
    api/stripe/webhook/            Stripe webhook handler
    api/export/                    CSV exports
    api/cron/reminders/            daily reminder job
  components/                      UI (cards, badges, tables, charts, forms)
  lib/
    billing.ts                     monthly status / totals / next-due logic
    data.ts                        database queries
    periods.ts                     month/year helpers (time-zone aware)
    stripe/                        Stripe client + idempotent sync functions
    supabase/                      server, browser, service-role and middleware clients
    notifications/                 notification types, templates, providers
public/
  sw.js                            service worker (installable app + offline screen)
  offline.html                     offline screen
  icons/                           app icons
supabase/
  migrations/0001_initial_schema.sql
  create_first_admin.sql
```
