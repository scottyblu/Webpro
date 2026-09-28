import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMonthRows, summarizeMonth, type MemberMonthRow, type MonthSummary } from "@/lib/billing";
import {
  addMonths,
  comparePeriods,
  currentPeriod,
  periodKey,
  periodOfDateString,
  periodRange,
  type Period,
} from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import type { ClubSettings, Member, Payment } from "@/lib/types";

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

export async function fetchAllMembers(supabase: SupabaseClient): Promise<Member[]> {
  return fetchPaged<Member>("members", (from, to) =>
    supabase.from("members").select("*").order("full_name").order("id").range(from, to),
  );
}

/** All payments from `from` (inclusive) to `to` (inclusive, optional), newest first. */
export async function fetchPaymentsInRange(supabase: SupabaseClient, from: Period, to?: Period): Promise<Payment[]> {
  const rows = await fetchPaged<Payment>("payments", (start, end) => {
    let q = supabase.from("payments").select("*").gte("payment_year", from.year);
    if (to) q = q.lte("payment_year", to.year);
    return q.order("payment_date", { ascending: false }).order("id").range(start, end);
  });
  return rows.filter((p) => {
    const period = { year: p.payment_year, month: p.payment_month };
    return comparePeriods(period, from) >= 0 && (!to || comparePeriods(period, to) <= 0);
  });
}

function futurePaidMap(payments: Payment[], current: Period): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of payments) {
    if (!p.member_id || p.payment_status !== "paid") continue;
    if (comparePeriods({ year: p.payment_year, month: p.payment_month }, current) < 0) continue;
    const set = map.get(p.member_id) ?? new Set<string>();
    set.add(periodKey({ year: p.payment_year, month: p.payment_month }));
    map.set(p.member_id, set);
  }
  return map;
}

/** Paid money in the month from members who have since been deleted (still counts as collected). */
function orphanCollected(payments: Payment[], period: Period): number {
  return payments
    .filter(
      (p) =>
        !p.member_id &&
        p.payment_status === "paid" &&
        p.payment_year === period.year &&
        p.payment_month === period.month,
    )
    .reduce((s, p) => s + p.amount_cents, 0);
}

export interface MonthOverview {
  settings: ClubSettings;
  period: Period;
  current: Period;
  rows: MemberMonthRow[];
  summary: MonthSummary;
}

/** Everything needed to show "who paid / who didn't" for one month. */
export async function getMonthOverview(supabase: SupabaseClient, requested?: Period | null): Promise<MonthOverview> {
  const settings = await getSettings(supabase);
  const current = currentPeriod(settings.timezone);
  const period = requested ?? current;
  const from = comparePeriods(period, current) < 0 ? period : current;

  const [members, payments] = await Promise.all([fetchAllMembers(supabase), fetchPaymentsInRange(supabase, from)]);

  const rows = buildMonthRows({
    members,
    payments,
    period,
    settings,
    futurePaidByMember: futurePaidMap(payments, current),
  });
  const summary = summarizeMonth(rows, settings);
  summary.collectedCents += orphanCollected(payments, period);
  return { settings, period, current, rows, summary };
}

/** Months available in the month picker: from the club's first member/payment until next month. */
export async function getAvailablePeriods(supabase: SupabaseClient, settings: ClubSettings): Promise<Period[]> {
  const current = currentPeriod(settings.timezone);
  const [{ data: firstMember }, { data: firstPayment }] = await Promise.all([
    supabase.from("members").select("joined_date").order("joined_date").limit(1).maybeSingle(),
    supabase
      .from("payments")
      .select("payment_year, payment_month")
      .order("payment_year")
      .order("payment_month")
      .limit(1)
      .maybeSingle(),
  ]);
  let earliest = current;
  if (firstMember?.joined_date) {
    const p = periodOfDateString(firstMember.joined_date as string);
    if (comparePeriods(p, earliest) < 0) earliest = p;
  }
  if (firstPayment) {
    const p = { year: firstPayment.payment_year as number, month: firstPayment.payment_month as number };
    if (comparePeriods(p, earliest) < 0) earliest = p;
  }
  return periodRange(earliest, addMonths(current, 1));
}

export interface MonthlyReportRow extends MonthSummary {
  period: Period;
}

/** Month-by-month totals, newest first. */
export async function getMonthlyHistory(
  supabase: SupabaseClient,
  months = 12,
): Promise<{ settings: ClubSettings; history: MonthlyReportRow[]; members: Member[]; totalRevenueCents: number }> {
  const settings = await getSettings(supabase);
  const current = currentPeriod(settings.timezone);
  const from = addMonths(current, -(months - 1));

  const [members, payments, totals] = await Promise.all([
    fetchAllMembers(supabase),
    fetchPaymentsInRange(supabase, from),
    fetchPaged<{ amount_cents: number }>("payment totals", (start, end) =>
      supabase.from("payments").select("amount_cents").eq("payment_status", "paid").order("id").range(start, end),
    ),
  ]);

  const history = periodRange(from, current).map((period) => {
    const rows = buildMonthRows({ members, payments, period, settings });
    const summary = summarizeMonth(rows, settings);
    summary.collectedCents += orphanCollected(payments, period);
    return { period, ...summary };
  });

  const totalRevenueCents = totals.reduce((sum, r) => sum + r.amount_cents, 0);
  return { settings, history, members, totalRevenueCents };
}

export async function getMemberWithPayments(
  supabase: SupabaseClient,
  memberId: string,
): Promise<{ member: Member; payments: Payment[] } | null> {
  const { data: member } = await supabase.from("members").select("*").eq("id", memberId).maybeSingle();
  if (!member) return null;
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .eq("member_id", memberId)
    .order("payment_year", { ascending: false })
    .order("payment_month", { ascending: false })
    .order("payment_date", { ascending: false });
  if (error) throw new Error(`Could not load payments: ${error.message}`);
  return { member: member as Member, payments: (payments ?? []) as Payment[] };
}

/** Total amount paid per member (all time). */
export async function getMemberTotals(supabase: SupabaseClient): Promise<Map<string, number>> {
  const rows = await fetchPaged<{ member_id: string | null; amount_cents: number }>("payment totals", (start, end) =>
    supabase
      .from("payments")
      .select("member_id, amount_cents")
      .eq("payment_status", "paid")
      .not("member_id", "is", null)
      .order("id")
      .range(start, end),
  );
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.member_id!, (totals.get(r.member_id!) ?? 0) + r.amount_cents);
  return totals;
}

/** Member-reported payments waiting for an admin to confirm (oldest first). */
export async function getPendingReports(supabase: SupabaseClient): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("payment_status", "pending")
    .is("stripe_payment_id", null)
    .order("created_at");
  if (error) throw new Error(`Could not load pending payments: ${error.message}`);
  return (data ?? []) as Payment[];
}
