import { CheckCircle2, CircleDollarSign, Target, Users, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { MonthSummary } from "@/lib/billing";
import { formatMoney } from "@/lib/format";

export function SummaryCards({ summary, currency }: { summary: MonthSummary; currency: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      <StatCard label="Total Members" value={summary.totalMembers} icon={<Users className="h-5 w-5" />} hint={summary.cancelled ? `${summary.cancelled} cancelled not counted` : "Active this month"} />
      <StatCard label="Paid" value={summary.paid} tone="green" icon={<CheckCircle2 className="h-5 w-5" />} hint="Paid this month" />
      <StatCard
        label="Unpaid"
        value={summary.unpaid}
        tone={summary.unpaid > 0 ? "red" : "neutral"}
        icon={<XCircle className="h-5 w-5" />}
        hint={summary.pending ? `incl. ${summary.pending} pending` : `${formatMoney(summary.owedCents, currency)} still owed`}
      />
      <StatCard label="Collected" value={formatMoney(summary.collectedCents, currency)} tone="green" icon={<CircleDollarSign className="h-5 w-5" />} hint="This month" />
      <div className="col-span-2 lg:col-span-1">
        <StatCard label="Expected" value={formatMoney(summary.expectedCents, currency)} icon={<Target className="h-5 w-5" />} hint="Monthly revenue" />
      </div>
    </div>
  );
}
