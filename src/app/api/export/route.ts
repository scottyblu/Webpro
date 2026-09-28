import { NextResponse, type NextRequest } from "next/server";
import { getAdminRecord } from "@/lib/auth";
import { hasLiveSubscription } from "@/lib/billing";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, MEMBERSHIP_STATUS_LABELS } from "@/lib/constants";
import { fetchAllMembers, fetchPaymentsInRange, getMemberTotals, getMonthOverview } from "@/lib/data";
import { csvCell, formatMoney } from "@/lib/format";
import { parsePeriodKey, periodKey, periodLabel, zonedDateString } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * CSV exports (admins only):
 *   /api/export?month=2026-09     who paid / didn't for a month
 *   /api/export?type=members      member list
 *   /api/export?type=payments     every payment ever recorded
 */
export async function GET(request: NextRequest) {
  if (!(await getAdminRecord())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const type = request.nextUrl.searchParams.get("type") ?? "month";
  const money = (c: number) => formatMoney(c, settings.currency);
  const date = (iso: string | null) => (iso ? zonedDateString(new Date(iso), settings.timezone) : "");

  let filename: string;
  let header: string[];
  let rows: unknown[][];

  if (type === "members") {
    const [members, totals] = await Promise.all([fetchAllMembers(supabase), getMemberTotals(supabase)]);
    filename = "members.csv";
    header = ["Name", "Email", "Phone", "Date Joined", "Membership Status", "Auto-pay", "Total Paid"];
    rows = members.map((m) => [
      m.full_name,
      m.email,
      m.phone ?? "",
      m.joined_date,
      MEMBERSHIP_STATUS_LABELS[m.membership_status],
      hasLiveSubscription(m) ? "Yes" : "No",
      money(totals.get(m.id) ?? 0),
    ]);
  } else if (type === "payments") {
    const payments = await fetchPaymentsInRange(supabase, { year: 2000, month: 1 });
    filename = "payments.csv";
    header = ["Month", "Member", "Amount", "Status", "Method", "Payment Date", "Stripe Invoice", "Notes"];
    rows = payments.map((p) => [
      periodLabel({ year: p.payment_year, month: p.payment_month }),
      p.member_name,
      money(p.amount_cents),
      PAYMENT_STATUS_LABELS[p.payment_status],
      PAYMENT_METHOD_LABELS[p.payment_method],
      date(p.payment_date),
      p.stripe_payment_id ?? "",
      p.notes ?? "",
    ]);
  } else {
    const { period, rows: monthRows, summary } = await getMonthOverview(supabase, parsePeriodKey(request.nextUrl.searchParams.get("month")));
    filename = `payments-${periodKey(period)}.csv`;
    header = ["Name", "Email", "Phone", "Status", "Amount", "Payment Date", "Method", "Next Due Date"];
    rows = monthRows.map((r) => [
      r.fullName,
      r.email,
      r.phone ?? "",
      r.status,
      money(r.amountCents),
      date(r.paymentDate),
      r.paymentMethod ? PAYMENT_METHOD_LABELS[r.paymentMethod] : "",
      r.nextDueDate ?? "",
    ]);
    rows.push([]);
    rows.push(["Total members", summary.totalMembers]);
    rows.push(["Paid", summary.paid]);
    rows.push(["Unpaid", summary.unpaid]);
    rows.push(["Collected", money(summary.collectedCents)]);
    rows.push(["Expected", money(summary.expectedCents)]);
    rows.push(["Still owed", money(summary.owedCents)]);
  }

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
