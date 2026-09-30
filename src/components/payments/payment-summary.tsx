import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MemberSummary } from "@/lib/billing";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { periodLabel } from "@/lib/periods";

/**
 * Payment summary for one member: Monthly Dues, Last Payment, Next Payment Due,
 * Paid Through, Current Billing Period, Current Status, Prepaid Months and
 * Total Paid This Year. Everything is calculated from the payment records.
 */
export function PaymentSummary({ summary, currency, timeZone }: { summary: MemberSummary; currency: string; timeZone: string }) {
  const money = (c: number) => formatMoney(c, currency);
  const last = summary.lastPayment;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Tile label="Monthly dues">{money(summary.duesCents)}</Tile>
      <Tile label="Last payment" hint={last ? `${formatDate(last.payment_date, timeZone)} · ${PAYMENT_METHOD_LABELS[last.payment_method]}` : undefined}>
        {last ? money(last.amount_cents) : "—"}
      </Tile>
      <Tile label="Next payment due" tone={summary.owedCents > 0 ? "red" : undefined}>
        {formatDate(summary.nextDueDate)}
      </Tile>
      <Tile label="Paid through">{summary.paidThrough ? periodLabel(summary.paidThrough) : "—"}</Tile>
      <Tile label="Current billing period">{periodLabel(summary.currentPeriod)}</Tile>
      <Tile label="Current status">
        <StatusBadge status={summary.status} />
      </Tile>
      <Tile label="Prepaid months" hint={summary.prepaidMonths > 0 ? "Paid ahead after this month" : undefined}>
        {summary.prepaidMonths}
      </Tile>
      <Tile label={`Total paid in ${summary.currentPeriod.year}`}>{money(summary.totalPaidThisYearCents)}</Tile>
    </div>
  );
}

function Tile({
  label,
  hint,
  tone,
  children,
}: {
  label: string;
  hint?: string;
  tone?: "red";
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <div className={`mt-2 text-lg font-bold ${tone === "red" ? "text-red-700" : ""}`}>{children}</div>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
    </Card>
  );
}
