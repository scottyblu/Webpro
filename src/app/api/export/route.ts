import { NextResponse, type NextRequest } from "next/server";
import { getAdminRecord } from "@/lib/auth";
import { hasLiveSubscription, memberDues } from "@/lib/billing";
import {
  EXTRA_CATEGORY_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  MONTH_STATUS_LABELS,
  PAYMENT_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/constants";
import { coveredMonthsByPayment, getLedger, memberTotals, monthOverviewFrom } from "@/lib/data";
import { csvCell, formatMoney } from "@/lib/format";
import { parsePeriodKey, periodKey, periodLabel, zonedDateString } from "@/lib/periods";
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
  const ledger = await getLedger(supabase);
  const { settings } = ledger;
  const type = request.nextUrl.searchParams.get("type") ?? "month";
  const money = (c: number) => formatMoney(c, settings.currency);
  const date = (iso: string | null) => (iso ? zonedDateString(new Date(iso), settings.timezone) : "");

  let filename: string;
  let header: string[];
  let rows: unknown[][];

  if (type === "members") {
    const totals = memberTotals(ledger);
    filename = "members.csv";
    header = ["Name", "Email", "Phone", "Date Joined", "Membership Status", "Monthly Dues", "Reminders", "Auto-pay", "Total Paid"];
    rows = ledger.members.map((m) => [
      m.full_name,
      m.email,
      m.phone ?? "",
      m.joined_date,
      MEMBERSHIP_STATUS_LABELS[m.membership_status],
      money(memberDues(m, settings)),
      m.notification_pref,
      hasLiveSubscription(m) ? "Yes" : "No",
      money(totals.get(m.id) ?? 0),
    ]);
  } else if (type === "payments") {
    const covered = coveredMonthsByPayment(ledger.allocations);
    filename = "payments.csv";
    header = ["Payment Date", "Member", "Amount", "Status", "Method", "For", "Months Covered", "Extra", "Extra Is", "Stripe Invoice", "Notes"];
    rows = ledger.payments.map((p) => {
      const months = covered.get(p.id) ?? [];
      return [
        date(p.payment_date),
        p.member_name,
        money(p.amount_cents),
        PAYMENT_STATUS_LABELS[p.payment_status],
        PAYMENT_METHOD_LABELS[p.payment_method],
        PAYMENT_CATEGORY_LABELS[p.category],
        months.map((m) => periodLabel(m)).join("; "),
        p.extra_cents > 0 ? money(p.extra_cents) : "",
        p.extra_category ? EXTRA_CATEGORY_LABELS[p.extra_category] : "",
        p.stripe_payment_id ?? "",
        p.notes ?? "",
      ];
    });
  } else {
    const requested = parsePeriodKey(request.nextUrl.searchParams.get("month")) ?? ledger.current;
    const { period, rows: monthRows, summary } = monthOverviewFrom(ledger, requested);
    filename = `payments-${periodKey(period)}.csv`;
    header = ["Name", "Email", "Phone", "Status", "Dues Covered", "Payment Amount", "Payment Date", "Method", "Paid Through", "Owes (all months)", "Next Due Date"];
    rows = monthRows.map((r) => [
      r.fullName,
      r.email,
      r.phone ?? "",
      MONTH_STATUS_LABELS[r.status],
      money(r.amountCents),
      r.paymentAmountCents ? money(r.paymentAmountCents) : "",
      date(r.paymentDate),
      r.paymentMethod ? PAYMENT_METHOD_LABELS[r.paymentMethod] : "",
      r.paidThrough ? periodLabel(r.paidThrough) : "",
      money(r.owedCents),
      r.nextDueDate ?? "",
    ]);
    rows.push([]);
    rows.push(["Total members", summary.totalMembers]);
    rows.push(["Paid", summary.paid]);
    rows.push(["Unpaid", summary.unpaid]);
    rows.push(["Money received this month", money(summary.collectedCents)]);
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
