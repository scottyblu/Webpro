import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { MonthPicker } from "@/components/admin/month-picker";
import { PaymentTable } from "@/components/admin/payment-table";
import { SummaryCards } from "@/components/admin/summary-cards";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth";
import { getAvailablePeriods, getMonthOverview } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { parsePeriodKey, periodKey, periodLabel } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string }> }) {
  await requireAdmin();
  const { month, status } = await searchParams;
  const supabase = await createClient();
  const settings = await getSettings(supabase);
  const [overview, periods] = await Promise.all([
    getMonthOverview(supabase, parsePeriodKey(month)),
    getAvailablePeriods(supabase, settings),
  ]);
  const { period, rows, summary } = overview;
  const key = periodKey(period);
  const options = periods.map((p) => ({ key: periodKey(p), label: periodLabel(p) }));
  if (!options.some((o) => o.key === key)) options.unshift({ key, label: periodLabel(period) });

  const initialFilter = (["PAID", "UNPAID", "PENDING", "CANCELLED"] as const).find((s) => s === status?.toUpperCase());

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

      <SummaryCards summary={summary} currency={overview.settings.currency} />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm font-medium text-emerald-800">Amount collected · {periodLabel(period)}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(summary.collectedCents, overview.settings.currency)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-medium text-red-800">Amount still owed · {periodLabel(period)}</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{formatMoney(summary.owedCents, overview.settings.currency)}</p>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title={periodLabel(period)} description={`${summary.paid} paid · ${summary.unpaid} unpaid`} />
        <PaymentTable
          key={key}
          rows={rows}
          currency={overview.settings.currency}
          period={key}
          timeZone={overview.settings.timezone}
          initialFilter={initialFilter}
        />
      </Card>
    </>
  );
}
