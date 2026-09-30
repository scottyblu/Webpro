import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCoverage,
  buildMonthRows,
  coverageFor,
  outstandingFor,
  revenueByMonth,
  summarizeMonth,
  type Coverage,
  type MemberMonthRow,
  type MonthSummary,
} from "@/lib/billing";
import {
  addMonths,
  comparePeriods,
  currentPeriod,
  periodKey,
  periodOfDate,
  periodOfDateString,
  periodRange,
  type Period,
} from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import type { ClubSettings, Member, Payment, PaymentAllocation } from "@/lib/types";

const PAGE_SIZE = 1000;

/** Supabase returns at most 1000 rows per request; page through larger result sets. */
async function fetchPaged<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return out;
  }
}

/** Fill in fields added by newer SQL files, so the app keeps working before they're run. */
function normalizePayment(p: Payment): Payment {
  return {
    ...p,
    category: p.category ?? "dues",
    months_count: p.months_count ?? 1,
    extra_cents: p.extra_cents ?? 0,
    extra_category: p.extra_category ?? null,
  };
}

function normalizeMember(m: Member): Member {
  return { ...m, notification_pref: m.notification_pref ?? "all", dues_cents: m.dues_cents ?? null, due_day: m.due_day ?? null };
}

export async function fetchAllMembers(supabase: SupabaseClient): Promise<Member[]> {
  const rows = await fetchPaged<Member>("members", (from, to) =>
    supabase.from("members").select("*").order("full_name").order("id").range(from, to),
  );
  return rows.map(normalizeMember);
}

/** Every payment (any status), newest first. */
export async function fetchAllPayments(supabase: SupabaseClient): Promise<Payment[]> {
  const rows = await fetchPaged<Payment>("payments", (from, to) =>
    supabase.from("payments").select("*").order("payment_date", { ascending: false }).order("id").range(from, to),
  );
  return rows.map(normalizePayment);
}

/**
 * Every month covered by a valid payment.
 * Returns null before SQL file 0005 is run (no allocations table yet).
 */
export async function fetchAllAllocations(supabase: SupabaseClient): Promise<PaymentAllocation[] | null> {
  try {
    return await fetchPaged<PaymentAllocation>("payment coverage", (from, to) =>
      supabase.from("payment_allocations").select("*").order("id").range(from, to),
    );
  } catch (err) {
    if (err instanceof Error && /payment_allocations/.test(err.message)) return null;
    throw err;
  }
}

/** Allocations, or (before SQL file 0005) one month per paid payment. */
function allocationsOrLegacy(allocations: PaymentAllocation[] | null, payments: Payment[]): PaymentAllocation[] {
  if (allocations) return allocations;
  return payments
    .filter((p) => p.payment_status === "paid" && p.member_id && p.amount_cents >= 2000)
    .map((p) => ({
      id: p.id,
      payment_id: p.id,
      member_id: p.member_id!,
      period_year: p.payment_year,
      period_month: p.payment_month,
      amount_cents: p.amount_cents,
      created_at: p.created_at,
    }));
}

export interface ClubLedger {
  settings: ClubSettings;
  members: Member[];
  payments: Payment[];
  allocations: PaymentAllocation[];
  coverage: Map<string, Coverage>;
  revenue: Map<string, number>;
  current: Period;
}

/** Everything the money screens need, loaded once and computed from the records (one source of truth). */
export async function getLedger(supabase: SupabaseClient): Promise<ClubLedger> {
  const settings = await getSettings(supabase);
  const [members, payments, rawAllocations] = await Promise.all([
    fetchAllMembers(supabase),
    fetchAllPayments(supabase),
    fetchAllAllocations(supabase),
  ]);
  const allocations = allocationsOrLegacy(rawAllocations, payments);
  return {
    settings,
    members,
    payments,
    allocations,
    coverage: buildCoverage(allocations, payments),
    revenue: revenueByMonth(payments, settings.timezone),
    current: currentPeriod(settings.timezone),
  };
}

export interface MonthOverview {
  settings: ClubSettings;
  period: Period;
  current: Period;
  rows: MemberMonthRow[];
  summary: MonthSummary;
  /** Everything owed by everyone, across all months up to now. */
  outstanding: { cents: number; members: number };
  /** All money ever received (valid payments only). */
  totalCollectedCents: number;
}

/** Everything needed to show "who paid / who didn't" for one month. */
export async function getMonthOverview(supabase: SupabaseClient, requested?: Period | null): Promise<MonthOverview> {
  const ledger = await getLedger(supabase);
  return monthOverviewFrom(ledger, requested ?? ledger.current);
}

export function monthOverviewFrom(ledger: ClubLedger, period: Period): MonthOverview {
  const { settings, members, payments, coverage, revenue, current } = ledger;
  const rows = buildMonthRows({ members, payments, coverage, period, settings });
  const summary = summarizeMonth(rows, revenue.get(periodKey(period)) ?? 0);
  const balances = members.map((m) => outstandingFor(m, coverageFor(coverage, m.id), settings).cents);
  return {
    settings,
    period,
    current,
    rows,
    summary,
    outstanding: { cents: balances.reduce((s, c) => s + c, 0), members: balances.filter((c) => c > 0).length },
    totalCollectedCents: [...revenue.values()].reduce((s, c) => s + c, 0),
  };
}

/** Months available in the month picker: from the club's first member/payment until a year ahead. */
export function availablePeriods(ledger: ClubLedger): Period[] {
  const { members, payments, allocations, settings, current } = ledger;
  let earliest = current;
  let latest = addMonths(current, 1);
  for (const m of members) {
    const p = periodOfDateString(m.joined_date);
    if (comparePeriods(p, earliest) < 0) earliest = p;
  }
  for (const p of payments) {
    const received = periodOfDate(new Date(p.payment_date), settings.timezone);
    if (comparePeriods(received, earliest) < 0) earliest = received;
  }
  for (const a of allocations) {
    const p = { year: a.period_year, month: a.period_month };
    if (comparePeriods(p, earliest) < 0) earliest = p;
    if (comparePeriods(p, latest) > 0) latest = p;
  }
  return periodRange(earliest, latest);
}

export interface MonthlyReportRow extends MonthSummary {
  period: Period;
}

/** Month-by-month totals, newest first. Revenue is money received that month. */
export async function getMonthlyHistory(
  supabase: SupabaseClient,
  months = 12,
): Promise<{ settings: ClubSettings; history: MonthlyReportRow[]; members: Member[]; totalRevenueCents: number }> {
  const ledger = await getLedger(supabase);
  const { settings, members, revenue } = ledger;
  const totalRevenueCents = [...revenue.values()].reduce((s, c) => s + c, 0);
  return { settings, history: monthlyHistoryFrom(ledger, months), members, totalRevenueCents };
}

export function monthlyHistoryFrom(ledger: ClubLedger, months: number): MonthlyReportRow[] {
  const { settings, members, payments, coverage, revenue, current } = ledger;
  return periodRange(addMonths(current, -(months - 1)), current).map((period) => {
    const rows = buildMonthRows({ members, payments, coverage, period, settings });
    return { period, ...summarizeMonth(rows, revenue.get(periodKey(period)) ?? 0) };
  });
}

export async function getMemberWithPayments(
  supabase: SupabaseClient,
  memberId: string,
): Promise<{ member: Member; payments: Payment[]; allocations: PaymentAllocation[] } | null> {
  const { data: member } = await supabase.from("members").select("*").eq("id", memberId).maybeSingle();
  if (!member) return null;
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .eq("member_id", memberId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load payments: ${error.message}`);
  const normalized = ((payments ?? []) as Payment[]).map(normalizePayment);
  const { data: allocations, error: allocError } = await supabase
    .from("payment_allocations")
    .select("*")
    .eq("member_id", memberId);
  const allocs = allocError ? null : ((allocations ?? []) as PaymentAllocation[]);
  return {
    member: normalizeMember(member as Member),
    payments: normalized,
    allocations: allocationsOrLegacy(allocs, normalized),
  };
}

/** Total amount paid per member (all time, valid payments only). */
export function memberTotals(ledger: ClubLedger): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of ledger.payments) {
    if (p.payment_status === "paid" && p.member_id) totals.set(p.member_id, (totals.get(p.member_id) ?? 0) + p.amount_cents);
  }
  return totals;
}

/** Member-reported payments waiting for an admin to confirm (oldest first). */
export function pendingReports(ledger: ClubLedger): Payment[] {
  return ledger.payments
    .filter((p) => p.payment_status === "pending" && !p.stripe_payment_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Months each payment covers, keyed by payment id (for history lists). */
export function coveredMonthsByPayment(allocations: PaymentAllocation[]): Map<string, Period[]> {
  const map = new Map<string, Period[]>();
  for (const a of allocations) {
    const list = map.get(a.payment_id) ?? [];
    list.push({ year: a.period_year, month: a.period_month });
    map.set(a.payment_id, list);
  }
  for (const list of map.values()) list.sort(comparePeriods);
  return map;
}
