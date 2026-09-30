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
import { confirmPendingPayment, recordPayment, rejectPendingPayment } from "@/app/actions/payments";
import { sendManualReminder } from "@/app/actions/reminders";
import { ManualPaymentForm } from "@/components/admin/manual-payment-form";
import { MemberForm } from "@/components/admin/member-form";
import { NotificationHistory, type NotificationLogRow } from "@/components/admin/notification-history";
import { PaymentHistory } from "@/components/admin/payment-history";
import { pendingCovers } from "@/components/admin/pending-payments";
import { SendReminderForm, type ReminderChannelOption } from "@/components/admin/send-reminder";
import { PaymentSummary } from "@/components/payments/payment-summary";
import { Alert } from "@/components/ui/alert";
import { MembershipBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdmin } from "@/lib/auth";
import { buildCoverage, coverageFor, firstUnpaidPeriod, hasLiveSubscription, memberSummary } from "@/lib/billing";
import { NOTIFICATION_PREF_LABELS } from "@/lib/constants";
import { coveredMonthsByPayment, getMemberWithPayments } from "@/lib/data";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { channelsForPref, emailConfigured, pushConfigured, smsConfigured } from "@/lib/notifications";
import { memberPushSubscriptions } from "@/lib/notifications/providers/push";
import {
  addMonths,
  comparePeriods,
  parsePeriodKey,
  periodKey,
  periodLabel,
  periodOfDateString,
  periodRange,
  zonedDateString,
} from "@/lib/periods";
import { manualReminderFor } from "@/lib/reminders";
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
  const { member, payments, allocations } = result;

  const summary = memberSummary({ member, payments, allocations, settings });
  const current = summary.currentPeriod;
  const cov = coverageFor(buildCoverage(allocations, payments), member.id);
  const covered = coveredMonthsByPayment(allocations);
  const autopay = hasLiveSubscription(member);
  const today = zonedDateString(new Date(), settings.timezone);

  // Months a payment can start from: from 12 months back (or when they joined) to 2 years ahead.
  const joinPeriod = periodOfDateString(member.joined_date);
  const earliest = comparePeriods(joinPeriod, addMonths(current, -12)) < 0 ? joinPeriod : addMonths(current, -12);
  const paidKeys = [...cov.paid.keys()];
  const periodOptions = periodRange(earliest, addMonths(current, 24))
    .reverse()
    .map((p) => ({ key: periodKey(p), label: `${periodLabel(p)}${cov.paid.has(periodKey(p)) ? " (paid)" : ""}` }));
  const requested = parsePeriodKey(record);
  const defaultPeriod = periodKey(requested ?? firstUnpaidPeriod(member, cov, settings));

  const pending = payments.filter((p) => p.payment_status === "pending" && p.payment_method !== "stripe");
  const isEnded = member.membership_status === "inactive" || member.membership_status === "cancelled";

  // Send reminder: only the methods that can reach this member.
  const pushDevices = pushConfigured() ? (await memberPushSubscriptions(member.id)).length : 0;
  const reminderOptions: ReminderChannelOption[] = [
    {
      value: "sms",
      label: "Text message (SMS)",
      available: !!member.phone && smsConfigured(),
      detail: !member.phone ? "No phone number on file" : smsConfigured() ? member.phone : "Text messages aren't set up (Twilio)",
    },
    {
      value: "email",
      label: "Email",
      available: !!member.email && !!emailConfigured(),
      detail: emailConfigured() ? member.email : "Email isn't set up",
    },
    {
      value: "push",
      label: "App notification",
      available: pushDevices > 0,
      detail: !pushConfigured()
        ? "App notifications aren't set up"
        : pushDevices > 0
          ? `${pushDevices} device${pushDevices === 1 ? "" : "s"}`
          : "They haven't turned on notifications in the app",
    },
  ];
  const nextReminder = manualReminderFor(member, cov, settings, today);
  const reminderAbout = nextReminder
    ? `${periodLabel(nextReminder.period)} · ${formatMoney(summary.duesCents, settings.currency)} ${
        nextReminder.type === "past_due_reminder" ? "overdue since" : "due"
      } ${formatDate(nextReminder.dueDate)}`
    : null;
  const prefChannels = channelsForPref(member.notification_pref);

  const { data: logRows } = await supabase
    .from("notification_log")
    .select("*")
    .eq("member_id", member.id)
    .neq("channel", "log")
    .order("created_at", { ascending: false })
    .limit(30);

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
              <MembershipBadge status={member.membership_status} />
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

      {/* Payment summary */}
      <div className="mt-6">
        <PaymentSummary summary={summary} currency={settings.currency} timeZone={settings.timezone} />
      </div>

      {summary.owedCents > 0 && (
        <Alert tone="error" className="mt-4">
          <strong>Owes {formatMoney(summary.owedCents, settings.currency)}</strong> for{" "}
          {summary.owedMonths.map((p) => periodLabel(p)).join(", ")}.
        </Alert>
      )}

      {pending.length > 0 && (
        <Card className="mt-4 border-amber-300 ring-1 ring-amber-200">
          <CardHeader title="Waiting for confirmation" description="They say they've sent these. Check your bank, then confirm or reject." />
          <ul className="divide-y divide-stone-100">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm">
                  <span className="font-semibold">{formatMoney(p.amount_cents, p.currency)}</span> Zelle {pendingCovers(p)}
                  <span className="block text-xs text-stone-500">Reported {formatDate(p.created_at, settings.timezone)}</span>
                </p>
                <div className="flex gap-2">
                  <form action={confirmPendingPayment.bind(null, p.id)}>
                    <SubmitButton variant="success" size="sm" pendingText="…">
                      Received
                    </SubmitButton>
                  </form>
                  <form action={rejectPendingPayment.bind(null, p.id)}>
                    <SubmitButton
                      variant="secondary"
                      size="sm"
                      pendingText="…"
                      confirmMessage="Mark this payment as not received? It stays in the history as voided."
                    >
                      Not received
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {/* Payment history */}
          <Card>
            <CardHeader
              title="Payment history"
              description={`${payments.length} record${payments.length === 1 ? "" : "s"} · ${formatMoney(summary.totalPaidCents, settings.currency)} paid in total`}
            />
            <PaymentHistory payments={payments} covered={covered} timeZone={settings.timezone} />
          </Card>

          {/* Notification history */}
          <Card>
            <CardHeader
              title="Notifications"
              description={`Reminders by: ${NOTIFICATION_PREF_LABELS[member.notification_pref]}`}
            />
            <NotificationHistory
              rows={(logRows ?? []) as NotificationLogRow[]}
              timeZone={settings.timezone}
              emptyText="No notifications sent to this member yet."
            />
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-2">
          {/* Record a payment */}
          <Card>
            <div id="record-payment" className="scroll-mt-20" />
            <CardHeader title="Record a payment" description="Cash, Zelle, Venmo, Cash App, check or other. Minimum $20." />
            <CardBody>
              <ManualPaymentForm
                action={recordPayment.bind(null, member.id)}
                periods={periodOptions}
                defaultPeriod={defaultPeriod}
                duesCents={summary.duesCents}
                currency={settings.currency}
                paidKeys={paidKeys}
                today={today}
              />
            </CardBody>
          </Card>

          {/* Send reminder */}
          <Card>
            <CardHeader
              title="Send reminder"
              description={
                prefChannels.length === 0
                  ? "They chose not to get automatic reminders; you can still send one."
                  : "Send a payment reminder now."
              }
            />
            <CardBody>
              <SendReminderForm
                action={sendManualReminder.bind(null, member.id)}
                options={reminderOptions}
                about={reminderAbout}
              />
            </CardBody>
          </Card>

          {/* Stripe */}
          {(member.stripe_subscription_id || process.env.STRIPE_SECRET_KEY) && (
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
                    {member.user_id
                      ? "Not subscribed. They can start auto-pay from their member dashboard."
                      : "Not subscribed. This member hasn't created a login yet."}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {/* Edit */}
          <Card>
            <CardHeader title="Edit member" />
            <CardBody>
              <MemberForm
                action={updateMember.bind(null, member.id)}
                submitLabel="Save changes"
                clubDues={formatMoney(settings.monthly_fee_cents, settings.currency)}
                clubDueDay={settings.payment_due_day}
                initial={{
                  full_name: member.full_name,
                  email: member.email,
                  phone: member.phone ?? "",
                  joined_date: member.joined_date,
                  notes: member.notes ?? "",
                  notification_pref: member.notification_pref,
                  dues: member.dues_cents ? (member.dues_cents / 100).toFixed(2) : "",
                  due_day: member.due_day ? String(member.due_day) : "",
                }}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
