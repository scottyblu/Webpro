import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Send } from "lucide-react";
import { PushToggle } from "@/components/member/push-toggle";
import { PayCard } from "@/components/member/pay-card";
import { PaymentSummary } from "@/components/payments/payment-summary";
import { Alert } from "@/components/ui/alert";
import { MembershipBadge, PaymentStatusBadge, StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAdminRecord, getCurrentMember } from "@/lib/auth";
import { buildCoverage, coverageFor, firstUnpaidPeriod, hasLiveSubscription, memberSummary } from "@/lib/billing";
import { PAYMENT_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { coveredMonthsByPayment, getMemberWithPayments } from "@/lib/data";
import { stripeEnabled } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { pushConfigured, vapidPublicKey } from "@/lib/notifications/providers/push";
import {
  addMonths,
  comparePeriods,
  periodKey,
  periodLabel,
  periodOfDateString,
  periodRange,
  periodShortLabel,
  type Period,
} from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { Payment } from "@/lib/types";

export const metadata: Metadata = { title: "My Membership" };

const MESSAGES: Record<string, { tone: "success" | "error" | "warning" | "info"; text: string }> = {
  "checkout=success": { tone: "success", text: "Thank you! Your payment was received. It can take a few seconds to show below." },
  "checkout=cancelled": { tone: "warning", text: "Checkout was cancelled — you have not been charged." },
  "cancelled=1": { tone: "info", text: "Your membership will end at the close of your current paid period. You won't be charged again." },
  "password=updated": { tone: "success", text: "Your password has been updated." },
  "error=inactive": { tone: "error", text: "Your membership is inactive. Please contact a club administrator." },
  "error=no-member": { tone: "error", text: "We couldn't find your membership record. Please contact a club administrator." },
  "error=no-customer": { tone: "error", text: "You don't have saved payment details yet. Use \"Pay\" to set up your membership." },
  "error=checkout": { tone: "error", text: "We couldn't start checkout. Please try again." },
  "error=no-stripe": { tone: "error", text: "Card payments aren't available. Please use one of the payment options below." },
};

export default async function MemberDashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const flash = Object.entries(params)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);

  const member = await getCurrentMember();
  if (!member) {
    const admin = await getAdminRecord();
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <h1 className="text-xl font-bold">No membership on this account</h1>
          <p className="mt-2 text-stone-600">
            {admin ? "You're signed in as an administrator." : "Please contact a club administrator to set up your membership."}
          </p>
          {admin && (
            <Link href="/admin" className={buttonClass("primary", "md", "mt-6")}>
              Go to admin dashboard
            </Link>
          )}
        </CardBody>
      </Card>
    );
  }

  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const result = await getMemberWithPayments(supabase, member.id);
  const payments = (result?.payments ?? []).filter((p) => p.payment_status !== "void");
  const allocations = result?.allocations ?? [];
  const covered = coveredMonthsByPayment(allocations);

  const summary = memberSummary({ member: result?.member ?? member, payments, allocations, settings });
  const { row, status } = summary;
  const period = summary.currentPeriod;
  const cov = coverageFor(buildCoverage(allocations, payments), member.id);
  const autopay = hasLiveSubscription(member);
  const fee = formatMoney(summary.duesCents, settings.currency);
  const firstName = member.full_name.split(" ")[0];
  const isPaid = status === "PAID" || status === "PAID_AHEAD";

  const canPay = member.membership_status !== "inactive";
  const stripeOn = stripeEnabled();
  const showCardPay = stripeOn && canPay && !autopay;
  const zelleOn = !!settings.zelle_contact && canPay;
  const venmoOn = !!settings.venmo_username && canPay;
  const payOn = zelleOn || venmoOn;
  const payWith = [zelleOn && "Zelle", venmoOn && "Venmo"].filter(Boolean).join(" or ");
  const pendingReport = payments.find((p) => p.payment_status === "pending" && p.payment_method !== "stripe");
  const pendingZelle = status === "PENDING" && !!pendingReport;

  // Months a Zelle / Venmo payment can start from: not already paid or waiting for confirmation,
  // from 6 months back (or when they joined) to 2 years ahead.
  const joined = periodOfDateString(member.joined_date);
  const earliest = comparePeriods(joined, addMonths(period, -6)) > 0 ? joined : addMonths(period, -6);
  const takenKeys = [...cov.paid.keys(), ...cov.pending.keys()];
  const taken = new Set(takenKeys);
  const openPeriods = periodRange(earliest, addMonths(period, 24))
    .reverse()
    .filter((p) => !taken.has(periodKey(p)));
  const zellePeriod = firstUnpaidPeriod(member, cov, settings);
  const zelleStart = openPeriods.find((p) => comparePeriods(p, zellePeriod) >= 0) ?? openPeriods[0];
  const pushKey = pushConfigured() && settings.push_enabled ? vapidPublicKey() : null;

  return (
    <div className="space-y-6">
      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Hi {firstName} 👋</h1>
        <p className="mt-1 text-stone-500">Here&apos;s your {settings.club_name} membership.</p>
      </div>

      {/* Current month status */}
      <Card className="overflow-hidden">
        <div
          className={
            isPaid
              ? "bg-emerald-50"
              : status === "PENDING"
                ? "bg-amber-50"
                : status === "CANCELLED"
                  ? "bg-stone-100"
                  : "bg-red-50"
          }
        >
          <CardBody className="py-6 sm:py-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{periodLabel(period)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={status} size="lg" />
              <span className="text-stone-700">
                {status === "PAID" && `You're paid up for ${periodLabel(period)}. Thank you!`}
                {status === "PAID_AHEAD" &&
                  `You're paid ahead through ${summary.paidThrough ? periodLabel(summary.paidThrough) : "future months"}. Thank you!`}
                {status === "UNPAID" && `Your ${fee} membership for ${periodLabel(period)} is due ${formatDate(row?.dueDate ?? null)}.`}
                {status === "OVERDUE" && `Your ${fee} membership for ${periodLabel(period)} was due ${formatDate(row?.dueDate ?? null)}.`}
                {status === "PENDING" &&
                  (pendingZelle
                    ? `Thanks! Your ${pendingReport?.payment_method === "venmo" ? "Venmo" : "Zelle"} payment is waiting for an administrator to confirm it arrived.`
                    : "Your payment is processing.")}
                {status === "CANCELLED" && "Your membership is not active."}
              </span>
            </div>
            {row?.lastAttemptFailed && (
              <p className="mt-3 text-sm font-medium text-red-700">
                Your last card payment failed. Please update your payment method.
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {showCardPay && (
                <form action="/api/stripe/checkout" method="post">
                  <SubmitButton size="lg" pendingText="Opening secure checkout…">
                    <CreditCard className="h-5 w-5" aria-hidden />
                    Pay {fee} / month
                  </SubmitButton>
                </form>
              )}
              {payOn && zelleStart && (
                <a href="#pay" className={buttonClass(showCardPay || isPaid || status === "PENDING" ? "secondary" : "primary", "lg")}>
                  <Send className="h-5 w-5" aria-hidden />
                  {isPaid || status === "PENDING" ? `Pay ahead with ${payWith}` : `Pay ${fee} with ${payWith}`}
                </a>
              )}
              {stripeOn && member.stripe_customer_id && (
                <form action="/api/stripe/portal" method="post">
                  <SubmitButton variant="secondary" size="lg" pendingText="Opening…">
                    Manage payment method
                  </SubmitButton>
                </form>
              )}
            </div>
            {canPay && !stripeOn && !payOn && !isPaid && (
              <p className="mt-4 text-sm text-stone-600">Please pay your dues to a club administrator (see contact details below).</p>
            )}
            {showCardPay && (
              <p className="mt-3 text-xs text-stone-500">
                Secure checkout by Stripe. Your card is charged {fee} today and automatically each month. Cancel anytime.
              </p>
            )}
          </CardBody>
        </div>
      </Card>

      {summary.owedCents > 0 && (
        <Alert tone="error">
          <strong>You owe {formatMoney(summary.owedCents, settings.currency)}</strong> for{" "}
          {summary.owedMonths.map((p) => periodLabel(p)).join(", ")}. Payments are applied to the oldest unpaid month first.
        </Alert>
      )}

      <PaymentSummary summary={summary} currency={settings.currency} timeZone={settings.timezone} />

      {pushKey && <PushToggle publicKey={pushKey} />}

      {payOn && zelleStart && (
        <PayCard
          duesCents={summary.duesCents}
          currency={settings.currency}
          zelle={zelleOn ? { recipientName: settings.zelle_recipient_name, contact: settings.zelle_contact! } : null}
          venmoUsername={venmoOn ? settings.venmo_username : null}
          memberName={member.full_name}
          periods={openPeriods.map((p) => ({ key: periodKey(p), label: periodLabel(p) }))}
          defaultPeriod={periodKey(zelleStart)}
          takenKeys={takenKeys}
        />
      )}

      {stripeOn && (
        <div className="grid gap-4 sm:grid-cols-3">
          <InfoTile
            icon={<CreditCard className="h-5 w-5" />}
            label="Auto-pay"
            value={autopay ? (member.cancel_at_period_end ? "Ends this period" : "On") : "Off"}
          />
        </div>
      )}

      <Card>
        <CardHeader title="Membership" />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-stone-500">Status</dt>
              <dd className="mt-1">
                <MembershipBadge status={member.membership_status} />
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Member since</dt>
              <dd className="mt-1 font-medium">{formatDate(member.joined_date)}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Monthly dues</dt>
              <dd className="mt-1 font-medium">{fee}</dd>
            </div>
          </dl>
          {stripeOn && autopay && !member.cancel_at_period_end && (
            <form action="/api/stripe/cancel" method="post" className="mt-6 border-t border-stone-100 pt-4">
              <SubmitButton
                variant="ghost"
                size="sm"
                className="text-red-600"
                pendingText="Cancelling…"
                confirmMessage="Cancel your membership? You'll stay active until the end of the period you've paid for and won't be charged again."
              >
                Cancel membership
              </SubmitButton>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Payment history" description="Every payment you've made and the months it covers." />
        {payments.length === 0 ? (
          <CardBody>
            <p className="py-6 text-center text-sm text-stone-500">No payments yet.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-stone-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{describePayment(p, covered.get(p.id))}</p>
                  <p className="text-xs text-stone-500">
                    {formatDate(p.payment_date, settings.timezone)} · {PAYMENT_METHOD_LABELS[p.payment_method]}
                    {p.extra_cents > 0 && p.months_count > 0 && ` · ${formatMoney(p.extra_cents, p.currency)} extra`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatMoney(p.amount_cents, p.currency)}</span>
                  <PaymentStatusBadge status={p.payment_status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(settings.admin_name || settings.admin_email || settings.admin_phone) && (
        <p className="text-center text-sm text-stone-500">
          Questions? Contact {settings.admin_name ?? "the club administrator"}
          {settings.admin_email && (
            <>
              {" "}
              at{" "}
              <a className="font-medium text-brand-600" href={`mailto:${settings.admin_email}`}>
                {settings.admin_email}
              </a>
            </>
          )}
          {settings.admin_phone && <> · {settings.admin_phone}</>}
        </p>
      )}
    </div>
  );
}

/** "October 2026" · "Oct 26 – Sep 27 (12 months)" · "Donation / extra contribution" */
function describePayment(p: Payment, covered: Period[] | undefined): string {
  const months =
    covered && covered.length
      ? covered
      : Array.from({ length: p.months_count }, (_, i) => addMonths({ year: p.payment_year, month: p.payment_month }, i));
  if (months.length === 0) return PAYMENT_CATEGORY_LABELS[p.category];
  if (months.length === 1) return periodLabel(months[0]!);
  return `${periodShortLabel(months[0]!)} – ${periodShortLabel(months[months.length - 1]!)} (${months.length} months)`;
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-stone-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </Card>
  );
}
