import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { MonthPicker } from "@/components/admin/month-picker";
import { PaymentHistory } from "@/components/admin/payment-history";
import { PaymentTable } from "@/components/admin/payment-table";
import { PendingPayments } from "@/components/admin/pending-payments";
import { SummaryCards } from "@/components/admin/summary-cards";
import { WipeHistoryButton } from "@/components/admin/wipe-history";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth";
import { availablePeriods, coveredMonthsByPayment, getLedger, monthOverviewFrom, pendingReports } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { parsePeriodKey, periodKey, periodLabel } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payments" };

const HISTORY_LIMIT = 100;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; status?: string; history?: string }>;
}) {
  await requireAdmin();
  const { month, status, history } = await searchParams;
  const supabase = await createClient();
  const ledger = await getLedger(supabase);
  const { settings } = ledger;
  const overview = monthOverviewFrom(ledger, parsePeriodKey(month) ?? ledger.current);
  const { period, rows, summary, outstanding } = overview;
  const key = periodKey(period);
  const options = availablePeriods(ledger).map((p) => ({ key: periodKey(p), label: periodLabel(p) }));
  if (!options.some((o) => o.key === key)) options.unshift({ key, label: periodLabel(period) });

  const pending = pendingReports(ledger);
  const covered = coveredMonthsByPayment(ledger.allocations);
  const showAll = history === "all";
  const transactions = showAll ? ledger.payments : ledger.payments.slice(0, HISTORY_LIMIT);

  const initialFilter = (["PAID", "PAID_AHEAD", "UNPAID", "OVERDUE", "PENDING", "CANCELLED", "OWES"] as const).find(
    (s) => s === status?.toUpperCase(),
  );

  return (
    <>
      <PageHeader
        title="Payments"
        description="Choose any month to see who paid, who didn't, and what's still owed."
        actions={
          <>
            <MonthPicker options={options} value={key} />
            <Link href={`/api/export?month=${key}`} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Link>
          </>
        }
      />

      {pending.length > 0 && (
        <div className="mb-6">
          <PendingPayments payments={pending} timeZone={settings.timezone} />
        </div>
      )}
      <SummaryCards summary={summary} currency={settings.currency} />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm font-medium text-emerald-800">Amount collected · {periodLabel(period)}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(summary.collectedCents, settings.currency)}</p>
          <p className="text-xs text-emerald-900">Money received this month (voided payments excluded)</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-medium text-red-800">Amount still owed · {periodLabel(period)}</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{formatMoney(summary.owedCents, settings.currency)}</p>
        </div>
        <div className="rounded-xl border border-red-300 bg-red-100 px-5 py-4">
          <p className="text-sm font-medium text-red-900">Total owed · all months</p>
          <p className="mt-1 text-2xl font-bold text-red-800">{formatMoney(outstanding.cents, settings.currency)}</p>
          <p className="text-xs text-red-900">
            by {outstanding.members} member{outstanding.members === 1 ? "" : "s"} ·{" "}
            <a href={`/payment-management?month=${key}&status=owes`} className="font-semibold underline">
              see who
            </a>
          </p>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title={periodLabel(period)} description={`${summary.paid} paid · ${summary.unpaid} unpaid`} />
        <PaymentTable
          key={key}
          rows={rows}
          currency={settings.currency}
          period={key}
          timeZone={settings.timezone}
          initialFilter={initialFilter}
        />
      </Card>

      <Card className="mt-6" id="history">
        <CardHeader
          title="Payment history"
          description={`Every payment received · ${formatMoney(overview.totalCollectedCents, settings.currency)} collected in total. Void, restore or delete a payment and every total updates.`}
        />
        <PaymentHistory
          payments={transactions}
          covered={covered}
          timeZone={settings.timezone}
          showMember
          emptyText="No payments recorded yet."
        />
        {!showAll && ledger.payments.length > HISTORY_LIMIT && (
          <p className="border-t border-stone-100 px-6 py-3 text-center text-sm">
            <Link href={`/payment-management?month=${key}&history=all#history`} className="font-semibold text-brand-600">
              Show all {ledger.payments.length} payments
            </Link>
          </p>
        )}
      </Card>

      <Card className="mt-6 border-red-200">
        <CardHeader
          title="Danger zone"
          description="Permanently delete every payment record to start fresh. Members are not deleted."
        />
        <div className="px-4 pb-5 sm:px-6">
          <WipeHistoryButton />
        </div>
      </Card>
    </>
  );
}
