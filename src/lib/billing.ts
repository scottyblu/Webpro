/**
 * Monthly payment logic. Pure functions (no database access) so the same rules
 * are used by the admin dashboard, the payments page, reports, CSV export,
 * the member dashboard and the reminder job.
 */
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/constants";
import {
  addMonths,
  comparePeriods,
  dueDateOf,
  firstDayOf,
  lastDayOf,
  periodKey,
  periodOfDateString,
  zonedDateString,
  type Period,
} from "@/lib/periods";
import type { ClubSettings, Member, MonthStatus, Payment } from "@/lib/types";

export interface MemberMonthRow {
  memberId: string;
  fullName: string;
  email: string;
  phone: string | null;
  membershipStatus: Member["membership_status"];
  status: MonthStatus;
  /** Amount actually received for this month (0 if unpaid). */
  amountCents: number;
  paymentDate: string | null;
  paymentMethod: Payment["payment_method"] | null;
  /** True when the latest Stripe charge attempt for the month failed. */
  lastAttemptFailed: boolean;
  nextDueDate: string | null;
  autopay: boolean;
}

export interface MonthSummary {
  totalMembers: number; // members billable this month (excludes cancelled)
  paid: number;
  unpaid: number; // includes pending
  pending: number;
  cancelled: number;
  collectedCents: number;
  expectedCents: number;
  owedCents: number;
}

export function hasLiveSubscription(member: Member): boolean {
  return !!member.stripe_subscription_id && LIVE_SUBSCRIPTION_STATUSES.includes(member.subscription_status ?? "");
}

export function isEnded(member: Member): boolean {
  return member.membership_status === "cancelled" || member.membership_status === "inactive";
}

/** Periods (as "YYYY-MM" keys) a member has a PAID payment for. */
export function paidPeriodKeys(payments: Payment[]): Set<string> {
  return new Set(
    payments
      .filter((p) => p.payment_status === "paid")
      .map((p) => periodKey({ year: p.payment_year, month: p.payment_month })),
  );
}

/**
 * When is this member's next payment due?
 *  - Stripe autopay: the end of the current Stripe billing period (the next automatic charge).
 *  - Otherwise: the due date of the earliest unpaid month, starting with the current month.
 *  - Cancelled/inactive members: nothing is due.
 */
export function nextDueDate(
  member: Member,
  paidKeys: Set<string>,
  settings: ClubSettings,
  now = new Date(),
): string | null {
  if (isEnded(member)) return null;
  if (hasLiveSubscription(member) && member.current_period_end && !member.cancel_at_period_end) {
    return zonedDateString(new Date(member.current_period_end), settings.timezone);
  }
  const today = zonedDateString(now, settings.timezone);
  const joinPeriod = periodOfDateString(member.joined_date);
  let p = periodOfDateString(today);
  if (comparePeriods(joinPeriod, p) > 0) p = joinPeriod;
  for (let i = 0; i < 36; i++) {
    if (!paidKeys.has(periodKey(p))) {
      const due = dueDateOf(p, settings.payment_due_day);
      return due < member.joined_date ? member.joined_date : due;
    }
    p = addMonths(p, 1);
  }
  return null;
}

/**
 * Should this member appear in the list for a given month?
 * - They must have joined on or before the end of the month.
 * - Members who ended before the month started are hidden for past months, but
 *   still listed (as CANCELLED) for the current month so the admin can find them.
 * - Anyone with a payment in the month is always shown.
 */
function isListedInPeriod(member: Member, period: Period, current: Period, hasPayment: boolean): boolean {
  if (hasPayment) return true;
  if (member.joined_date > lastDayOf(period)) return false;
  if (member.ended_at && member.ended_at < firstDayOf(period) && comparePeriods(period, current) < 0) return false;
  return true;
}

function statusForPeriod(member: Member, period: Period, monthPayments: Payment[]): MonthStatus {
  if (monthPayments.some((p) => p.payment_status === "paid")) return "PAID";
  if (monthPayments.some((p) => p.payment_status === "pending")) return "PENDING";
  // Ended on/before the end of this month and never paid it => cancelled for this month.
  if (isEnded(member) && (!member.ended_at || member.ended_at <= lastDayOf(period))) return "CANCELLED";
  return "UNPAID";
}

/**
 * Build the "who paid / who didn't" rows for one month.
 * @param payments all payments IN the month (any status)
 * @param futurePaidByMember paid payments from the current month onward, used for "next due date"
 */
export function buildMonthRows(opts: {
  members: Member[];
  payments: Payment[];
  period: Period;
  settings: ClubSettings;
  futurePaidByMember?: Map<string, Set<string>>;
  now?: Date;
}): MemberMonthRow[] {
  const { members, payments, period, settings, futurePaidByMember, now = new Date() } = opts;
  const current = periodOfDateString(zonedDateString(now, settings.timezone));

  const byMember = new Map<string, Payment[]>();
  for (const p of payments) {
    if (!p.member_id || p.payment_year !== period.year || p.payment_month !== period.month) continue;
    const list = byMember.get(p.member_id) ?? [];
    list.push(p);
    byMember.set(p.member_id, list);
  }

  const rows: MemberMonthRow[] = [];
  for (const member of members) {
    const monthPayments = byMember.get(member.id) ?? [];
    if (!isListedInPeriod(member, period, current, monthPayments.length > 0)) continue;

    const status = statusForPeriod(member, period, monthPayments);
    const paid = monthPayments.find((p) => p.payment_status === "paid");
    const shown = paid ?? monthPayments.find((p) => p.payment_status === "pending") ?? null;
    const latestAttempt = [...monthPayments].sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0];

    rows.push({
      memberId: member.id,
      fullName: member.full_name,
      email: member.email,
      phone: member.phone,
      membershipStatus: member.membership_status,
      status,
      amountCents: paid?.amount_cents ?? 0,
      paymentDate: shown?.payment_date ?? null,
      paymentMethod: shown?.payment_method ?? null,
      lastAttemptFailed: status === "UNPAID" && latestAttempt?.payment_status === "failed",
      nextDueDate: nextDueDate(member, futurePaidByMember?.get(member.id) ?? new Set(), settings, now),
      autopay: hasLiveSubscription(member) && !member.cancel_at_period_end,
    });
  }

  const order: Record<MonthStatus, number> = { UNPAID: 0, PENDING: 1, PAID: 2, CANCELLED: 3 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.fullName.localeCompare(b.fullName));
}

export function summarizeMonth(rows: MemberMonthRow[], settings: ClubSettings): MonthSummary {
  const paid = rows.filter((r) => r.status === "PAID").length;
  const pending = rows.filter((r) => r.status === "PENDING").length;
  const unpaidOnly = rows.filter((r) => r.status === "UNPAID").length;
  const cancelled = rows.filter((r) => r.status === "CANCELLED").length;
  const totalMembers = paid + pending + unpaidOnly;
  const collectedCents = rows.reduce((sum, r) => sum + (r.status === "PAID" ? r.amountCents : 0), 0);
  const expectedCents = totalMembers * settings.monthly_fee_cents;
  return {
    totalMembers,
    paid,
    unpaid: unpaidOnly + pending,
    pending,
    cancelled,
    collectedCents,
    expectedCents,
    owedCents: (unpaidOnly + pending) * settings.monthly_fee_cents,
  };
}
