import "server-only";
import {
  billingStartPeriod,
  coverageFor,
  hasLiveSubscription,
  isEnded,
  memberDueDate,
  memberDues,
  outstandingFor,
  type Coverage,
} from "@/lib/billing";
import { DEFAULT_OVERDUE_MESSAGE, DEFAULT_REMINDER_MESSAGE } from "@/lib/constants";
import type { ClubLedger } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { notify, type DeliveryChannel, type DeliveryResult } from "@/lib/notifications";
import { addMonths, comparePeriods, firstDayOf, periodKey, periodLabel, periodOfDateString, type Period } from "@/lib/periods";
import type { ClubSettings, Member } from "@/lib/types";

/**
 * Payment reminders.
 *
 * Every day the reminder job works out, from the payment records, which members
 * have a month that is still unpaid and whose due date is exactly one of the
 * configured days away (default 3 days before, 1 day before, and the due date),
 * or — when overdue reminders are on — exactly one of the configured days past due.
 *
 * Because it is recalculated from the records each day:
 *  - a member who pays (or prepays) stops getting reminders for the months covered;
 *  - if that payment is voided or deleted, reminders start again on the next scheduled day.
 * Each reminder is sent at most once: member + month + reminder type + scheduled day.
 */

export type ReminderType = "upcoming_payment_reminder" | "past_due_reminder";

export interface PlannedReminder {
  member: Member;
  type: ReminderType;
  period: Period;
  dueDate: string; // YYYY-MM-DD
  /** Days before (positive) or after (negative) the due date. */
  daysUntilDue: number;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) / 86_400_000);
}

/** "October 1" */
export function formatDueDate(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${ymd}T12:00:00Z`),
  );
}

function isCovered(cov: Coverage, p: Period): boolean {
  const key = periodKey(p);
  return cov.paid.has(key) || cov.pending.has(key);
}

/** Months a member is billed for (from their billing start, until they left). */
function isBillable(member: Member, p: Period, settings: ClubSettings): boolean {
  if (comparePeriods(p, billingStartPeriod(member, settings.timezone)) < 0) return false;
  if (member.ended_at && member.ended_at < firstDayOf(p)) return false;
  return true;
}

/** The reminders that are due to go out today. */
export function planReminders(ledger: ClubLedger, today: string): PlannedReminder[] {
  const { settings, members, coverage } = ledger;
  const current = periodOfDateString(today);
  const before = new Set(settings.reminder_days_before.map(Number));
  const after = new Set(settings.overdue_days_after.map(Number));
  const out: PlannedReminder[] = [];

  for (const member of members) {
    if (isEnded(member) || member.notification_pref === "none") continue;
    const cov = coverageFor(coverage, member.id);

    // Upcoming: this month's or next month's due date is N days away and not paid yet.
    // Auto-pay (Stripe) members are charged automatically, so they don't need these.
    if (settings.reminders_enabled && !hasLiveSubscription(member)) {
      for (const p of [current, addMonths(current, 1)]) {
        if (!isBillable(member, p, settings) || isCovered(cov, p)) continue;
        const dueDate = memberDueDate(member, p, settings);
        const days = daysBetween(today, dueDate);
        if (days >= 0 && before.has(days)) out.push({ member, type: "upcoming_payment_reminder", period: p, dueDate, daysUntilDue: days });
      }
    }

    // Overdue: an unpaid month whose due date was exactly N days ago.
    if (settings.overdue_enabled) {
      for (const p of outstandingFor(member, cov, settings, new Date(`${today}T12:00:00Z`)).months) {
        const dueDate = memberDueDate(member, p, settings);
        const days = daysBetween(dueDate, today);
        if (days > 0 && after.has(days)) out.push({ member, type: "past_due_reminder", period: p, dueDate, daysUntilDue: -days });
      }
    }
  }
  return out;
}

/** Reminder channels switched on in Settings → Payment reminders. */
export function enabledChannels(settings: ClubSettings): DeliveryChannel[] {
  const out: DeliveryChannel[] = [];
  if (settings.sms_enabled) out.push("sms");
  if (settings.email_enabled) out.push("email");
  if (settings.push_enabled) out.push("push");
  return out;
}

function payInstructions(settings: ClubSettings, amount: string): string | undefined {
  if (!settings.zelle_contact) return undefined;
  return `Pay ${amount} with Zelle to ${settings.zelle_recipient_name ? `${settings.zelle_recipient_name} ` : ""}(${settings.zelle_contact}), then tap "I've sent my Zelle payment" in the app.`;
}

/** Send one reminder (scheduled or manual). */
export async function sendReminder(
  settings: ClubSettings,
  reminder: Omit<PlannedReminder, "daysUntilDue">,
  opts: { scheduledFor: string; channels?: DeliveryChannel[]; manual?: boolean },
): Promise<DeliveryResult[]> {
  const { member, type, period, dueDate } = reminder;
  const amount = formatMoney(memberDues(member, settings), settings.currency);
  const overdue = type === "past_due_reminder";
  const template = overdue
    ? (settings.overdue_message ?? DEFAULT_OVERDUE_MESSAGE)
    : (settings.reminder_message ?? DEFAULT_REMINDER_MESSAGE);

  return notify(
    opts.manual ? "manual_reminder" : type,
    { memberId: member.id, name: member.full_name, email: member.email, phone: member.phone, pref: member.notification_pref },
    {
      clubName: settings.club_name,
      amount,
      periodLabel: periodLabel(period),
      dueDate: formatDueDate(dueDate),
      dashboardUrl: `${siteUrl()}/dashboard`,
      payInstructions: payInstructions(settings, amount),
      customMessage: template,
    },
    opts.manual
      ? `manual_reminder:${member.id}:${periodKey(period)}:${Date.now()}`
      : `${type}:${member.id}:${periodKey(period)}:${opts.scheduledFor}`,
    {
      channels: opts.channels ?? enabledChannels(settings),
      usePreference: !opts.manual,
      period,
      scheduledFor: opts.scheduledFor,
    },
  );
}

/**
 * What a manual "Send reminder" is about: the oldest overdue month if there is one,
 * otherwise the next month that's due.
 */
export function manualReminderFor(
  member: Member,
  cov: Coverage,
  settings: ClubSettings,
  today: string,
): Omit<PlannedReminder, "daysUntilDue"> | null {
  const owed = outstandingFor(member, cov, settings, new Date(`${today}T12:00:00Z`)).months;
  for (const p of owed) {
    const dueDate = memberDueDate(member, p, settings);
    if (dueDate < today) return { member, type: "past_due_reminder", period: p, dueDate };
  }
  let p = periodOfDateString(today);
  for (let i = 0; i < 36; i++, p = addMonths(p, 1)) {
    if (!isBillable(member, p, settings)) {
      if (member.ended_at && member.ended_at < firstDayOf(p)) return null;
      continue;
    }
    if (!isCovered(cov, p)) return { member, type: "upcoming_payment_reminder", period: p, dueDate: memberDueDate(member, p, settings) };
  }
  return null;
}
