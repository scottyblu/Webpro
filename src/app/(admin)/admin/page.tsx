import type { Metadata } from "next";
import Link from "next/link";
import { Download, UserPlus } from "lucide-react";
import { PaymentTable } from "@/components/admin/payment-table";
import { PendingPayments } from "@/components/admin/pending-payments";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SummaryCards } from "@/components/admin/summary-cards";
import { BarChart, PaidProgress } from "@/components/ui/bar-chart";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth";
import { getLedger, monthOverviewFrom, monthlyHistoryFrom, pendingReports } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { periodKey, periodLabel, periodShortLabel } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requireAdmin();
  const supabase = await createClient();
  const ledger = await getLedger(supabase);
  const { settings, period, rows, summary, outstanding } = monthOverviewFrom(ledger, ledger.current);
  const history = monthlyHistoryFrom(ledger, 6);
  const pending = pendingReports(ledger);

  return (
    <>
      <PageHeader
        title={periodLabel(period)}
        description={`Who has paid their ${formatMoney(settings.monthly_fee_cents, settings.currency)} this month.`}
        actions={
          <>
            <Link href={`/api/export?month=${periodKey(period)}`} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> CSV
            </Link>
            <Link href="/member-management/new" className={buttonClass("primary")}>
              <UserPlus className="h-4 w-4" aria-hidden /> Add member
            </Link>
          </>
        }
      />

      <InstallPrompt className="mb-4 lg:hidden" />
      {pending.length > 0 && (
        <div className="mb-6">
          <PendingPayments payments={pending} timeZone={settings.timezone} />
        </div>
      )}
      <SummaryCards summary={summary} currency={settings.currency} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="This month" />
          <CardBody className="space-y-5">
            <PaidProgress paid={summary.paid} total={summary.totalMembers} />
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-stone-500">Collected</dt>
                <dd className="text-lg font-bold text-emerald-600">{formatMoney(summary.collectedCents, settings.currency)}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Still owed this month</dt>
                <dd className="text-lg font-bold text-red-600">{formatMoney(summary.owedCents, settings.currency)}</dd>
              </div>
              <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
                <dt className="text-red-800">Total owed, all months</dt>
                <dd className="text-lg font-bold text-red-700">
                  {formatMoney(outstanding.cents, settings.currency)}
                  <span className="ml-2 text-sm font-normal text-red-800">
                    by {outstanding.members} member{outstanding.members === 1 ? "" : "s"}
                  </span>
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Collected by month" description="Last 6 months · gray = expected" />
          <CardBody>
            <BarChart
              height={170}
              data={[...history].reverse().map((h) => ({
                label: periodShortLabel(h.period),
                value: h.collectedCents,
                target: h.expectedCents,
                display: formatMoney(h.collectedCents, settings.currency),
              }))}
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Member payments"
          description={`${periodLabel(period)} · click a member to see their full history`}
          action={
            <Link href="/payment-management" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              Other months →
            </Link>
          }
        />
        <PaymentTable
          rows={rows}
          currency={settings.currency}
          period={periodKey(period)}
          timeZone={settings.timezone}
        />
      </Card>
    </>
  );
}
