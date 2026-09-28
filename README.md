# THE BREAKFAST CLUB

A membership-dues app for a private club. Members pay **$20/month** through Stripe; the administrator opens the dashboard and immediately sees **who paid this month and who still owes**.

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
2. **Create the database**: left sidebar → **SQL Editor** → **New query** → paste the entire contents of [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) → **Run**. You should see “Success. No rows returned”. (See [section 2](#2-database-sql).)
3. **Copy your keys**: **Project Settings** (gear icon) →
   - **Data API** → *Project URL* → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **API Keys** → the *anon / public* key (or a *publishable* key, `sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **API Keys** → the *service_role* key (or a *secret* key, `sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY` — **server only, never share it**
4. **Auth URLs**: **Authentication → URL Configuration**
   - **Site URL**: `http://localhost:3000` for now (change to your real domain after deploying)
   - **Redirect URLs** → add both:
     - `http://localhost:3000/**`
     - `https://YOUR-DOMAIN/**` (add once you know your production domain)
5. **Email confirmation**: **Authentication → Sign In / Providers → Email** → make sure **Confirm email** is **ON** (keeps people from registering with someone else’s email).
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
7. **Production email (recommended)**: Supabase’s built-in email sender is limited to a few emails per hour. Before inviting real members, set up your own SMTP under **Authentication → Emails → SMTP Settings** (Resend, Postmark, SendGrid, Amazon SES, Gmail Workspace, etc.).

## 2. Database SQL

The complete schema is in **[`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)**. Run it once in the Supabase SQL Editor (it is safe to re-run). It creates:

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
- **One paid payment per member per month**: partial unique index on `(member_id, payment_year, payment_month) WHERE payment_status = 'paid'`.
- **Permanent history**: deleting a member sets `payments.member_id` to `NULL` and keeps the payment (with the member’s name) — revenue reports stay correct. Deactivating never touches payments.
- **Row Level Security** on every table: members can read only their own member row and payments; admins (via `is_admin()`) can read everything; the browser can’t write anything directly — all writes go through server code that checks authorization first.
- **Automatic account linking**: a trigger on `auth.users` creates a member record when someone registers, or links their login to an existing member the admin already added with the same email.

Amounts are stored in cents (`2000` = $20.00) to avoid rounding errors.

## 3. Stripe setup

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
| `STRIPE_SECRET_KEY` | yes | Stripe → Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | yes | Stripe → Developers → Webhooks → endpoint → Signing secret (or `stripe listen` output locally) |
| `STRIPE_PRICE_ID` | no | Stripe → Product catalog → your monthly price (`price_…`). Leave empty to use the fee from Settings |
| `CRON_SECRET` | yes for reminders | Any long random string: `openssl rand -hex 32` |
| `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL` | no | <https://resend.com> → API Keys; the from-address must be on a domain verified in Resend |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | no | <https://console.twilio.com> → Account Info; a Twilio phone number |

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

**Monthly status.** Every payment row belongs to a month (`payment_month`, `payment_year`) in the club’s time zone. For any month, each member is:

| Status | Meaning |
| --- | --- |
| **PAID** (green) | a `paid` payment exists for that month (Stripe or manual) |
| **PENDING** (yellow) | a payment is awaiting confirmation (e.g. bank authentication) |
| **UNPAID** (red) | no payment for that month; “Card failed” is shown if the last Stripe attempt failed |
| **CANCELLED** (gray) | the member was cancelled/deactivated and didn’t pay that month |

*Total Members* counts everyone billable that month (not cancelled). *Expected* = Total Members × monthly fee. *Collected* = sum of paid payments. *Still owed* = unpaid members × fee. Months are never overwritten — each is computed from the permanent payment history, so you can pick any past month on the **Payments** page.

**Stripe flow.** *Pay* → Stripe Checkout (subscription, $20/month) → Stripe charges the card → `invoice.paid` webhook → a `paid` payment row for that month. Each renewal creates the next month’s row automatically. A failed renewal records a `failed` row, marks the member PAST DUE and sends a failed-payment notice; a later successful retry flips it to paid. If a member already paid a month another way (cash), a Stripe payment for that month is applied to the next unpaid month instead of being lost.

**Next payment date.** Auto-pay members: the next Stripe charge date. Everyone else: the due day (Settings) of the earliest unpaid month.

**Security.** `/admin`, `/member-management`, `/payment-management` and `/reports` are protected three times on the server: in middleware, in the admin layout, and in every server action / API route (`requireAdmin()`). The database’s Row Level Security additionally prevents members from reading anyone else’s data even if they call Supabase directly. Card numbers never touch this app — Stripe Checkout and the Customer Portal handle them.

**Notifications.** [`src/lib/notifications`](src/lib/notifications) contains the four message types (payment confirmation, upcoming payment reminder, failed payment notice, past-due reminder), their wording (`templates.ts`), and pluggable providers: email via Resend and SMS via Twilio switch on automatically when their env vars are set; every notification is also logged. Sending is de-duplicated through `notification_log`. To use another provider, add a file in `providers/` implementing `NotificationProvider` and register it in `index.ts`.

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
