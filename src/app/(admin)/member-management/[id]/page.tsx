import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import {
  cancelMemberSubscription,
  deactivateMember,
  deleteMember,
  reactivateMember,
  updateMember,
} from "@/app/actions/members";
import { confirmPendingPayment, recordManualPayment, rejectPendingPayment, voidManualPayment } from "@/app/actions/payments";
import { ManualPaymentForm } from "@/components/admin/manual-payment-form";
import { MemberForm } from "@/components/admin/member-form";
import { Alert } from "@/components/ui/alert";
import { MembershipBadge, PaymentStatusBadge, StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdmin } from "@/lib/auth";
import { buildMonthRows, hasLiveSubscription, paidPeriodKeys } from "@/lib/billing";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { getMemberWithPayments } from "@/lib/data";
import { formatDate, formatMoney, initials } from "@/lib/format";
import {
  addMonths,
  comparePeriods,
  currentPeriod,
  parsePeriodKey,
  periodKey,
  periodLabel,
  periodOfDateString,
  periodRange,
  zonedDateString,
} from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Member" };

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ record?: string; created?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { record, created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [result, settings] = await Promise.all([getMemberWithPayments(supabase, id), getSettings(supabase)]);
  if (!result) notFound();
  const { member, payments } = result;

  const current = currentPeriod(settings.timezone);
  const [row] = buildMonthRows({
    members: [member],
    payments,
    period: current,
    settings,
    futurePaidByMember: new Map([[member.id, paidPeriodKeys(payments)]]),
  });
  const monthStatus = row?.status ?? "CANCELLED";
  const totalPaid = payments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const autopay = hasLiveSubscription(member);

  // Months the admin can record a payment for: from 12 months before joining/now up to 3 months ahead.
  const joinPeriod = periodOfDateString(member.joined_date);
  const earliest = comparePeriods(joinPeriod, addMonths(current, -12)) < 0 ? joinPeriod : addMonths(current, -12);
  const paidKeys = paidPeriodKeys(payments);
  const periodOptions = periodRange(earliest, addMonths(current, 3)).map((p) => ({
    key: periodKey(p),
    label: `${periodLabel(p)}${paidKeys.has(periodKey(p)) ? " (paid)" : ""}`,
  }));
  const requested = parsePeriodKey(record);
  const firstUnpaid = periodRange(earliest, current).reverse().find((p) => !paidKeys.has(periodKey(p)) && comparePeriods(p, joinPeriod) >= 0);
  const defaultPeriod = requested ? periodKey(requested) : periodKey(paidKeys.has(periodKey(current)) ? (firstUnpaid ?? addMonths(current, 1)) : current);

  const isEnded = member.membership_status === "inactive" || member.membership_status === "cancelled";

  return (
    <>
      <Link href="/member-management" className="text-sm font-medium text-stone-500 hover:text-stone-800">
        ← Members
      </Link>

      {created && (
        <Alert tone="success" className="mt-4">
          Member added.
        </Alert>
      )}

      {/* Header */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
            {initials(member.full_name)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">{member.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <a href={`mailto:${member.email}`} className="inline-flex items-center gap-1 hover:text-stone-800">
                <Mail className="h-4 w-4" aria-hidden /> {member.email}
              </a>
              {member.phone && (
                <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1 hover:text-stone-800">
                  <Phone className="h-4 w-4" aria-hidden /> {member.phone}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEnded ? (
            <form action={reactivateMember.bind(null, member.id)}>
              <SubmitButton variant="success" pendingText="Reactivating…">
                Reactivate
              </SubmitButton>
            </form>
          ) : (
            <form action={deactivateMember.bind(null, member.id)}>
              <SubmitButton
                variant="secondary"
                pendingText="Deactivating…"
                confirmMessage={`Deactivate ${member.full_name}?${autopay ? " Their Stripe subscription will be cancelled immediately so they are not charged again." : ""} Their payment history is kept.`}
              >
                Deactivate
              </SubmitButton>
            </form>
          )}
          <form action={deleteMember.bind(null, member.id)}>
            <SubmitButton
              variant="danger"
              pendingText="Deleting…"
              confirmMessage={`Permanently delete ${member.full_name}? This removes the member and their login. Their past payments stay in the payment history and reports. This cannot be undone.`}
            >
              Delete
            </SubmitButton>
          </form>
        </div>
      </div>

      {/* Overview */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Overview label="Membership status">
          <MembershipBadge status={member.membership_status} />
        </Overview>
        <Overview label={periodLabel(current)}>
          <StatusBadge status={monthStatus} />
        </Overview>
        <Overview label="Date joined">{formatDate(member.joined_date)}</Overview>
        <Overview label="Total amount paid">{formatMoney(totalPaid, settings.currency)}</Overview>
        <Overview label="Next payment due">{formatDate(row?.nextDueDate ?? null)}</Overview>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        {/* Payment history */}
        <Card className="xl:col-span-3">
          <CardHeader title="Payment history" description={`${payments.length} record${payments.length === 1 ? "" : "s"} · kept permanently`} />
          {payments.length === 0 ? (
            <CardBody>
              <p className="py-8 text-center text-sm text-stone-500">No payments yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-stone-100">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-6">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">
                      {periodLabel({ year: p.payment_year, month: p.payment_month })} — {formatMoney(p.amount_cents, p.currency)} —{" "}
                      {PAYMENT_METHOD_LABELS[p.payment_method]}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatDate(p.payment_date, settings.timezone)}
                      {p.notes && <> · {p.notes}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PaymentStatusBadge status={p.payment_status} />
                    {p.payment_method !== "stripe" && p.payment_status === "pending" && (
                      <>
                        <form action={confirmPendingPayment.bind(null, p.id)}>
                          <SubmitButton variant="success" size="sm" className="text-xs" pendingText="…">
                            Confirm
                          </SubmitButton>
                        </form>
                        <form action={rejectPendingPayment.bind(null, p.id)}>
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            className="text-xs text-stone-500"
                            pendingText="…"
                            confirmMessage="Mark this payment as not received? It stays in the history as voided."
                          >
                            Reject
                          </SubmitButton>
                        </form>
                      </>
                    )}
                    {p.payment_method !== "stripe" && p.payment_status === "paid" && (
                      <form action={voidManualPayment.bind(null, p.id)}>
                        <SubmitButton
                          variant="ghost"
                          size="sm"
                          className="text-xs text-stone-500"
                          pendingText="…"
                          confirmMessage="Void this manual payment? Use this only if it was recorded by mistake. It stays in the history marked as voided."
                        >
                          Void
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          {/* Manual payment */}
          <Card>
            <div id="record-payment" className="scroll-mt-20" />
            <CardHeader title="Record a payment" description="Cash, Zelle, Venmo, Cash App, check or other." />
            <CardBody>
              <ManualPaymentForm
                action={recordManualPayment.bind(null, member.id)}
                periods={periodOptions}
                defaultPeriod={defaultPeriod}
                defaultAmount={(settings.monthly_fee_cents / 100).toFixed(2)}
                today={zonedDateString(new Date(), settings.timezone)}
              />
            </CardBody>
          </Card>

          {/* Stripe */}
          <Card>
            <CardHeader title="Stripe auto-pay" />
            <CardBody className="space-y-3 text-sm">
              {member.stripe_subscription_id ? (
                <>
                  <p>
                    Subscription: <span className="font-medium">{member.subscription_status ?? "unknown"}</span>
                    {member.cancel_at_period_end && <span className="text-amber-700"> · cancels at period end</span>}
                  </p>
                  {member.current_period_end && (
                    <p>
                      Current period ends: <span className="font-medium">{formatDate(member.current_period_end, settings.timezone)}</span>
                    </p>
                  )}
                  {autopay && !member.cancel_at_period_end && (
                    <form action={cancelMemberSubscription.bind(null, member.id)}>
                      <SubmitButton
                        variant="secondary"
                        size="sm"
                        pendingText="Cancelling…"
                        confirmMessage="Cancel this member's Stripe subscription at the end of the current paid period?"
                      >
                        Cancel subscription at period end
                      </SubmitButton>
                    </form>
                  )}
                </>
              ) : (
                <p className="text-stone-500">
                  {!process.env.STRIPE_SECRET_KEY
                    ? "Stripe card payments are not set up (optional)."
                    : member.user_id
                      ? "Not subscribed. They can start auto-pay from their member dashboard."
                      : "Not subscribed. This member hasn't created a login yet."}
                </p>
              )}
            </CardBody>
          </Card>

          {/* Edit */}
          <Card>
            <CardHeader title="Edit member" />
            <CardBody>
              <MemberForm
                action={updateMember.bind(null, member.id)}
                submitLabel="Save changes"
                initial={{
                  full_name: member.full_name,
                  email: member.email,
                  phone: member.phone ?? "",
                  joined_date: member.joined_date,
                  notes: member.notes ?? "",
                }}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Overview({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <div className="mt-2 text-lg font-bold">{children}</div>
    </Card>
  );
}
