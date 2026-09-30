/**
 * Monthly payment logic. Pure functions (no database access) so the same rules
 * are used by the admin dashboard, the payments page, reports, CSV export,
 * the member dashboard and the reminder job.
 *
 * Two separate ideas:
 *  - MONEY:    payments (transactions). Revenue for a month = valid payments RECEIVED
 *              that month (cash basis). A $240 payment in September is $240 of
 *              September revenue.
 *  - COVERAGE: payment allocations. A month is paid only when a full month's dues
 *              from a valid payment covers it. There is no "partially paid".
 * Voided/deleted payments have no allocations and are never counted as money.
 */
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/constants";
import {
  addMonths,
  comparePeriods,
  dueDateOf,
  firstDayOf,
  lastDayOf,
  periodKey,
  periodOfDate,
  periodOfDateString,
  zonedDateString,
  type Period,
} from "@/lib/periods";
import type { ClubSettings, Member, MonthStatus, Payment, PaymentAllocation } from "@/lib/types";

export interface MemberMonthRow {
  memberId: string;
  fullName: string;
  email: string;
  phone: string | null;
  membershipStatus: Member["membership_status"];
  status: MonthStatus;
  /** Dues covered for this month (0 if not paid). */
  amountCents: number;
  /** The payment that covers (or was reported for) this month. */
  paymentId: string | null;
  paymentAmountCents: number;
  paymentMonths: number;
  paymentDate: string | null;
  paymentMethod: Payment["payment_method"] | null;
  /** True when the latest Stripe charge attempt for the month failed. */
  lastAttemptFailed: boolean;
  /** Due date of the month being shown. */
  dueDate: string;
  nextDueDate: string | null;
  paidThrough: Period | null;
  /** Paid months after the current month. */
  prepaidMonths: number;
  autopay: boolean;
  /** A one-month manual payment for this month (the admin can undo a mis-tap). */
  manualPaymentId: string | null;
  /** Everything this member still owes, across all months up to the current one. */
  owedCents: number;
  owedMonths: Period[];
  duesCents: number;
}

export interface MonthSummary {
  totalMembers: number; // members billable this month (excludes cancelled)
  paid: number; // includes paid ahead
  unpaid: number; // includes overdue and pending
  pending: number;
  overdue: number;
  cancelled: number;
  /** Money received during the month (cash basis, valid payments only). */
  collectedCents: number;
  expectedCents: number;
  owedCents: number;
}

/** A member's coverage: which months are paid (and by which payment) or reported. */
export interface Coverage {
  paid: Map<string, { paymentId: string; amountCents: number }>;
  /** Months a member reported paying (Zelle) that aren't confirmed yet. */
  pending: Map<string, string>;
}

export function hasLiveSubscription(member: Member): boolean {
  return !!member.stripe_subscription_id && LIVE_SUBSCRIPTION_STATUSES.includes(member.subscription_status ?? "");
}

export function isEnded(member: Member): boolean {
  return member.membership_status === "cancelled" || member.membership_status === "inactive";
}

export function memberDues(member: Member, settings: ClubSettings): number {
  return member.dues_cents ?? settings.monthly_fee_cents;
}

export function memberDueDay(member: Member, settings: ClubSettings): number {
  return member.due_day ?? settings.payment_due_day;
}

/** Due date (YYYY-MM-DD) of a month for a member; never before the day they joined. */
export function memberDueDate(member: Member, period: Period, settings: ClubSettings): string {
  const due = dueDateOf(period, memberDueDay(member, settings));
  return due < member.joined_date ? member.joined_date : due;
}

/**
 * First month a member is expected to pay: the month they joined, or the month
 * they were added to the app if that's later (so long-time members don't show
 * years of "owed" dues from before the club used the app).
 */
export function billingStartPeriod(member: Member, timeZone: string): Period {
  const joined = periodOfDateString(member.joined_date);
  const added = periodOfDateString(zonedDateString(new Date(member.created_at), timeZone));
  return comparePeriods(joined, added) >= 0 ? joined : added;
}

/** Months a payment says it covers, starting at its first month. */
export function paymentPlannedPeriods(p: Payment): Period[] {
  const out: Period[] = [];
  for (let i = 0; i < p.months_count; i++) out.push(addMonths({ year: p.payment_year, month: p.payment_month }, i));
  return out;
}

/** Build every member's coverage from allocations (paid) and pending member reports. */
export function buildCoverage(allocations: PaymentAllocation[], payments: Payment[]): Map<string, Coverage> {
  const map = new Map<string, Coverage>();
  const get = (memberId: string) => {
    let c = map.get(memberId);
    if (!c) {
      c = { paid: new Map(), pending: new Map() };
      map.set(memberId, c);
    }
    return c;
  };
  for (const a of allocations) {
    get(a.member_id).paid.set(periodKey({ year: a.period_year, month: a.period_month }), {
      paymentId: a.payment_id,
      amountCents: a.amount_cents,
    });
  }
  for (const p of payments) {
    if (!p.member_id || p.payment_status !== "pending") continue;
    for (const period of paymentPlannedPeriods(p)) get(p.member_id).pending.set(periodKey(period), p.id);
  }
  return map;
}

const EMPTY_COVERAGE: Coverage = { paid: new Map(), pending: new Map() };
export function coverageFor(coverage: Map<string, Coverage>, memberId: string): Coverage {
  return coverage.get(memberId) ?? EMPTY_COVERAGE;
}

/** Last month of the unbroken run of paid months starting at the member's first billable month. */
export function paidThrough(member: Member, cov: Coverage, settings: ClubSettings): Period | null {
  let p = billingStartPeriod(member, settings.timezone);
  let last: Period | null = null;
  for (let i = 0; i < 600 && cov.paid.has(periodKey(p)); i++) {
    last = p;
    p = addMonths(p, 1);
  }
  return last;
}

/** First month (from the member's first billable month) that isn't paid. */
export function firstUnpaidPeriod(member: Member, cov: Coverage, settings: ClubSettings): Period {
  let p = billingStartPeriod(member, settings.timezone);
  for (let i = 0; i < 600 && cov.paid.has(periodKey(p)); i++) p = addMonths(p, 1);
  return p;
}

/**
 * When is this member's next payment due?
 *  - Stripe autopay: the next automatic charge.
 *  - Otherwise: the due date of the first unpaid month (which may be in the past = overdue).
 *  - Cancelled/inactive members: nothing is due.
 */
export function nextDueDate(member: Member, cov: Coverage, settings: ClubSettings): string | null {
  if (isEnded(member)) return null;
  if (hasLiveSubscription(member) && member.current_period_end && !member.cancel_at_period_end) {
    return zonedDateString(new Date(member.current_period_end), settings.timezone);
  }
  return memberDueDate(member, firstUnpaidPeriod(member, cov, settings), settings);
}

/**
 * Unpaid months from the member's billing start up to the current month.
 * Months reported as paid (pending confirmation) aren't counted as owed.
 * Months after a member was cancelled/deactivated aren't owed.
 */
export function outstandingFor(
  member: Member,
  cov: Coverage,
  settings: ClubSettings,
  now = new Date(),
): { cents: number; months: Period[] } {
  const current = periodOfDateString(zonedDateString(now, settings.timezone));
  const months: Period[] = [];
  for (
    let p = billingStartPeriod(member, settings.timezone), i = 0;
    comparePeriods(p, current) <= 0 && i < 240;
    p = addMonths(p, 1), i++
  ) {
    if (member.ended_at && member.ended_at < firstDayOf(p)) break;
    const key = periodKey(p);
    if (!cov.paid.has(key) && !cov.pending.has(key)) months.push(p);
  }
  return { cents: months.length * memberDues(member, settings), months };
}

/** Status of one member for one month. */
export function statusForPeriod(
  member: Member,
  period: Period,
  cov: Coverage,
  settings: ClubSettings,
  now = new Date(),
): MonthStatus {
  const today = zonedDateString(now, settings.timezone);
  const current = periodOfDateString(today);
  const key = periodKey(period);
  if (cov.paid.has(key)) {
    const isCurrent = comparePeriods(period, current) === 0;
    return isCurrent && cov.paid.has(periodKey(addMonths(current, 1))) ? "PAID_AHEAD" : "PAID";
  }
  if (cov.pending.has(key)) return "PENDING";
  if (isEnded(member) && (!member.ended_at || member.ended_at <= lastDayOf(period))) return "CANCELLED";
  return today > memberDueDate(member, period, settings) ? "OVERDUE" : "UNPAID";
}

/**
 * Should this member appear in the list for a given month?
 * - They must have joined on or before the end of the month.
 * - Members who ended before the month started are hidden for past months, but
 *   still listed (as CANCELLED) for the current month so the admin can find them.
 * - Anyone with coverage in the month is always shown.
 */
function isListedInPeriod(member: Member, period: Period, current: Period, covered: boolean): boolean {
  if (covered) return true;
  if (member.joined_date > lastDayOf(period)) return false;
  if (member.ended_at && member.ended_at < firstDayOf(period) && comparePeriods(period, current) < 0) return false;
  return true;
}

/** Build the "who paid / who didn't" rows for one month. */
export function buildMonthRows(opts: {
  members: Member[];
  /** Payments (any status) used for details and pending reports. */
  payments: Payment[];
  coverage: Map<string, Coverage>;
  period: Period;
  settings: ClubSettings;
  now?: Date;
}): MemberMonthRow[] {
  const { members, payments, coverage, period, settings, now = new Date() } = opts;
  const current = periodOfDateString(zonedDateString(now, settings.timezone));
  const key = periodKey(period);
  const paymentById = new Map(payments.map((p) => [p.id, p]));

  const rows: MemberMonthRow[] = [];
  for (const member of members) {
    const cov = coverageFor(coverage, member.id);
    const paidEntry = cov.paid.get(key);
    const pendingId = cov.pending.get(key);
    if (!isListedInPeriod(member, period, current, !!paidEntry || !!pendingId)) continue;

    const status = statusForPeriod(member, period, cov, settings, now);
    const payment = paymentById.get(paidEntry?.paymentId ?? pendingId ?? "") ?? null;
    const failedAttempt = payments.some(
      (p) =>
        p.member_id === member.id &&
        p.payment_status === "failed" &&
        p.payment_year === period.year &&
        p.payment_month === period.month,
    );
    const owed = outstandingFor(member, cov, settings, now);
    let prepaid = 0;
    for (let p = addMonths(current, 1); cov.paid.has(periodKey(p)) && prepaid < 600; p = addMonths(p, 1)) prepaid++;

    rows.push({
      memberId: member.id,
      fullName: member.full_name,
      email: member.email,
      phone: member.phone,
      membershipStatus: member.membership_status,
      status,
      amountCents: paidEntry?.amountCents ?? 0,
      paymentId: payment?.id ?? null,
      paymentAmountCents: payment?.amount_cents ?? 0,
      paymentMonths: payment?.months_count ?? 0,
      paymentDate: payment?.payment_date ?? null,
      paymentMethod: payment?.payment_method ?? null,
      lastAttemptFailed: (status === "UNPAID" || status === "OVERDUE") && failedAttempt,
      dueDate: memberDueDate(member, period, settings),
      nextDueDate: nextDueDate(member, cov, settings),
      paidThrough: paidThrough(member, cov, settings),
      prepaidMonths: prepaid,
      autopay: hasLiveSubscription(member) && !member.cancel_at_period_end,
      manualPaymentId:
        paidEntry && payment && payment.payment_method !== "stripe" && payment.months_count === 1 ? payment.id : null,
      owedCents: owed.cents,
      owedMonths: owed.months,
      duesCents: memberDues(member, settings),
    });
  }

  const order: Record<MonthStatus, number> = { OVERDUE: 0, UNPAID: 1, PENDING: 2, PAID: 3, PAID_AHEAD: 4, CANCELLED: 5 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.fullName.localeCompare(b.fullName));
}

/**
 * Money received per month (cash basis): valid (paid) payments by the date received,
 * in the club's time zone. Voided, pending, failed and refunded payments never count.
 */
export function revenueByMonth(payments: Payment[], timeZone: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    if (p.payment_status !== "paid") continue;
    const key = periodKey(periodOfDate(new Date(p.payment_date), timeZone));
    map.set(key, (map.get(key) ?? 0) + p.amount_cents);
  }
  return map;
}

export function summarizeMonth(rows: MemberMonthRow[], collectedCents: number): MonthSummary {
  const count = (...s: MonthStatus[]) => rows.filter((r) => s.includes(r.status)).length;
  const billable = rows.filter((r) => r.status !== "CANCELLED");
  const unpaidRows = rows.filter((r) => r.status === "UNPAID" || r.status === "OVERDUE" || r.status === "PENDING");
  return {
    totalMembers: billable.length,
    paid: count("PAID", "PAID_AHEAD"),
    unpaid: unpaidRows.length,
    pending: count("PENDING"),
    overdue: count("OVERDUE"),
    cancelled: count("CANCELLED"),
    collectedCents,
    expectedCents: billable.reduce((s, r) => s + r.duesCents, 0),
    owedCents: unpaidRows.reduce((s, r) => s + r.duesCents, 0),
  };
}

export interface MemberSummary {
  duesCents: number;
  currentPeriod: Period;
  status: MonthStatus;
  lastPayment: Payment | null;
  nextDueDate: string | null;
  paidThrough: Period | null;
  /** Paid months after the current month. */
  prepaidMonths: number;
  totalPaidThisYearCents: number;
  totalPaidCents: number;
  owedCents: number;
  owedMonths: Period[];
  row: MemberMonthRow | null;
}

/** Everything the member profile and the member dashboard show about a member's payments. */
export function memberSummary(opts: {
  member: Member;
  payments: Payment[];
  allocations: PaymentAllocation[];
  settings: ClubSettings;
  now?: Date;
}): MemberSummary {
  const { member, payments, allocations, settings, now = new Date() } = opts;
  const coverage = buildCoverage(allocations, payments);
  const cov = coverageFor(coverage, member.id);
  const current = periodOfDateString(zonedDateString(now, settings.timezone));
  const [row] = buildMonthRows({ members: [member], payments, coverage, period: current, settings, now });
  const valid = payments.filter((p) => p.payment_status === "paid");
  const lastPayment = [...valid].sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0] ?? null;
  const thisYear = valid.filter((p) => periodOfDate(new Date(p.payment_date), settings.timezone).year === current.year);
  let prepaid = 0;
  for (let p = addMonths(current, 1); cov.paid.has(periodKey(p)) && prepaid < 600; p = addMonths(p, 1)) prepaid++;
  const owed = outstandingFor(member, cov, settings, now);
  return {
    duesCents: memberDues(member, settings),
    currentPeriod: current,
    status: row?.status ?? (isEnded(member) ? "CANCELLED" : "UNPAID"),
    lastPayment,
    nextDueDate: nextDueDate(member, cov, settings),
    paidThrough: paidThrough(member, cov, settings),
    prepaidMonths: prepaid,
    totalPaidThisYearCents: thisYear.reduce((s, p) => s + p.amount_cents, 0),
    totalPaidCents: valid.reduce((s, p) => s + p.amount_cents, 0),
    owedCents: owed.cents,
    owedMonths: owed.months,
    row: row ?? null,
  };
}

/**
 * Plan how a payment covers months: whole months of dues only, the rest is extra.
 * $50 with $20 dues => 2 months + $10 extra. Never a partial month.
 */
export function planPayment(amountCents: number, duesCents: number, requestedMonths?: number) {
  const maxMonths = Math.floor(amountCents / duesCents);
  const months = requestedMonths === undefined ? maxMonths : Math.min(Math.max(0, requestedMonths), maxMonths);
  return { months, maxMonths, extraCents: amountCents - months * duesCents };
}

/**
 * The months a new payment would cover, starting at `start` and skipping months
 * that are already paid (mirrors the database's allocation rule).
 */
export function previewCoverage(start: Period, months: number, paidKeys: Set<string>): Period[] {
  const out: Period[] = [];
  for (let p = start, guard = 0; out.length < months && guard < 600; p = addMonths(p, 1), guard++) {
    if (!paidKeys.has(periodKey(p))) out.push(p);
  }
  return out;
}
