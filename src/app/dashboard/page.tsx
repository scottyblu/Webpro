import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CreditCard, Receipt, Send } from "lucide-react";
import { ZelleCard } from "@/components/member/zelle-card";
import { Alert } from "@/components/ui/alert";
import { MembershipBadge, PaymentStatusBadge, StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAdminRecord, getCurrentMember } from "@/lib/auth";
import { buildMonthRows, hasLiveSubscription, paidPeriodKeys } from "@/lib/billing";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { stripeEnabled } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { addMonths, comparePeriods, currentPeriod, periodKey, periodLabel, periodOfDateString, periodRange } from "@/lib/periods";
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
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("member_id", member.id)
    .order("payment_year", { ascending: false })
    .order("payment_month", { ascending: false })
    .order("payment_date", { ascending: false });
  const payments = (data ?? []) as Payment[];

  const period = currentPeriod(settings.timezone);
  const [row] = buildMonthRows({
    members: [member],
    payments,
    period,
    settings,
    futurePaidByMember: new Map([[member.id, paidPeriodKeys(payments)]]),
  });
  const status = row?.status ?? (member.membership_status === "active" ? "UNPAID" : "CANCELLED");
  const autopay = hasLiveSubscription(member);
  const fee = formatMoney(settings.monthly_fee_cents, settings.currency);
  const totalPaid = payments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const firstName = member.full_name.split(" ")[0];

  const canPay = member.membership_status !== "inactive";
  const stripeOn = stripeEnabled();
  const showCardPay = stripeOn && canPay && !autopay;
  const zelleOn = !!settings.zelle_contact && canPay;
  const pendingZelle = status === "PENDING" && payments.some(
    (p) => p.payment_status === "pending" && p.payment_method !== "stripe" && p.payment_year === period.year && p.payment_month === period.month,
  );

  // Months a Zelle payment can be reported for: not already paid or waiting for confirmation.
  const joined = periodOfDateString(member.joined_date);
  const earliest = comparePeriods(joined, addMonths(period, -6)) > 0 ? joined : addMonths(period, -6);
  const taken = new Set(
    payments
      .filter((p) => p.payment_status === "paid" || p.payment_status === "pending")
      .map((p) => periodKey({ year: p.payment_year, month: p.payment_month })),
  );
  const openPeriods = periodRange(earliest, addMonths(period, 3))
    .reverse()
    .filter((p) => !taken.has(periodKey(p)));
  const zellePeriod =
    openPeriods.find((p) => comparePeriods(p, period) === 0) ?? openPeriods.find((p) => comparePeriods(p, period) < 0) ?? openPeriods[0];

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
            status === "PAID"
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
                {status === "UNPAID" && `Your ${fee} membership for ${periodLabel(period)} is due.`}
                {status === "PENDING" &&
                  (pendingZelle
                    ? "Thanks! Your Zelle payment is waiting for an administrator to confirm it arrived."
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
              {zelleOn && zellePeriod && status !== "PAID" && status !== "PENDING" && (
                <a href="#zelle" className={buttonClass(showCardPay ? "secondary" : "primary", "lg")}>
                  <Send className="h-5 w-5" aria-hidden />
                  Pay {fee} with Zelle
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
            {canPay && !stripeOn && !zelleOn && status !== "PAID" && (
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

      {zelleOn && zellePeriod && (
        <ZelleCard
          fee={fee}
          recipientName={settings.zelle_recipient_name}
          contact={settings.zelle_contact!}
          memberName={member.full_name}
          periods={openPeriods.map((p) => ({ key: periodKey(p), label: periodLabel(p) }))}
          defaultPeriod={periodKey(zellePeriod)}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <InfoTile icon={<CalendarClock className="h-5 w-5" />} label="Next payment due" value={formatDate(row?.nextDueDate ?? null)} />
        <InfoTile icon={<Receipt className="h-5 w-5" />} label="Total paid" value={formatMoney(totalPaid, settings.currency)} />
        {stripeOn ? (
          <InfoTile
            icon={<CreditCard className="h-5 w-5" />}
            label="Auto-pay"
            value={autopay ? (member.cancel_at_period_end ? "Ends this period" : "On") : "Off"}
          />
        ) : (
          <InfoTile icon={<CreditCard className="h-5 w-5" />} label="Pay with" value={settings.zelle_contact ? "Zelle" : "An administrator"} />
        )}
      </div>

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
        <CardHeader title="Payment history" description="Every payment you've made, by month." />
        {payments.length === 0 ? (
          <CardBody>
            <p className="py-6 text-center text-sm text-stone-500">No payments yet.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-stone-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{periodLabel({ year: p.payment_year, month: p.payment_month })}</p>
                  <p className="text-xs text-stone-500">
                    {formatDate(p.payment_date, settings.timezone)} · {PAYMENT_METHOD_LABELS[p.payment_method]}
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
