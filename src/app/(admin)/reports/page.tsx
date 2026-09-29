import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { BarChart } from "@/components/ui/bar-chart";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { requireAdmin } from "@/lib/auth";
import { getMonthlyHistory } from "@/lib/data";
import { formatMoney, formatPercent } from "@/lib/format";
import { periodKey, periodLabel, periodShortLabel } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { settings, history, members, totalRevenueCents } = await getMonthlyHistory(supabase, 12);
  const thisMonth = history[0]!;
  const activeMembers = members.filter((m) => m.membership_status === "active" || m.membership_status === "past_due").length;
  const yearCollected = history.reduce((s, h) => s + h.collectedCents, 0);
  const money = (c: number) => formatMoney(c, settings.currency);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Membership revenue and payment trends."
        actions={
          <>
            <Link href="/api/export?type=payments" className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> All payments CSV
            </Link>
            <Link href="/api/export?type=members" className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> Members CSV
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Monthly revenue" value={money(thisMonth.collectedCents)} tone="green" hint={periodLabel(thisMonth.period)} />
        <StatCard label="Total revenue" value={money(totalRevenueCents)} hint="All time" />
        <StatCard label="Active members" value={activeMembers} hint={`${members.length} total on file`} />
        <StatCard label="Paid" value={formatPercent(thisMonth.paid, thisMonth.totalMembers)} tone="green" hint={`${thisMonth.paid} of ${thisMonth.totalMembers} this month`} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Unpaid" value={formatPercent(thisMonth.unpaid, thisMonth.totalMembers)} tone="red" hint={`${thisMonth.unpaid} of ${thisMonth.totalMembers} this month`} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Monthly revenue"
          description={`Money received each month (a $240 yearly payment counts in the month it was paid) · last 12 months: ${money(yearCollected)} · gray = expected dues`}
        />
        <CardBody>
          <BarChart
            height={220}
            data={[...history].reverse().map((h) => ({
              label: periodShortLabel(h.period),
              value: h.collectedCents,
              target: h.expectedCents,
              display: money(h.collectedCents),
            }))}
          />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Monthly payment history" description="Click a month to see who paid." />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3 sm:px-6">Month</th>
                <th className="px-3 py-3 text-right">Members</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Unpaid</th>
                <th className="px-3 py-3 text-right">Paid %</th>
                <th className="px-3 py-3 text-right">Revenue</th>
                <th className="px-3 py-3 text-right">Expected</th>
                <th className="px-4 py-3 text-right sm:px-6">Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {history.map((h) => (
                <tr key={periodKey(h.period)} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                    <Link href={`/payment-management?month=${periodKey(h.period)}`} className="font-semibold text-stone-900 hover:text-brand-600">
                      {periodLabel(h.period)}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{h.totalMembers}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{h.paid}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-red-700">{h.unpaid}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatPercent(h.paid, h.totalMembers)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(h.collectedCents)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-stone-600">{money(h.expectedCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-700 sm:px-6">{money(h.owedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
