import Link from "next/link";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { deletePayment, restorePayment, voidPayment } from "@/app/actions/payments";
import { PaymentStatusBadge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { EXTRA_CATEGORY_LABELS, PAYMENT_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { addMonths, periodLabel, periodShortLabel, type Period } from "@/lib/periods";
import type { Payment } from "@/lib/types";

function describeCovered(months: Period[]): string {
  if (months.length === 0) return "";
  if (months.length === 1) return periodLabel(months[0]!);
  return `${periodShortLabel(months[0]!)} – ${periodShortLabel(months[months.length - 1]!)} (${months.length} months)`;
}

/** What a payment covers: its allocated months, or (pending/voided) the months it was meant for. */
function coverText(p: Payment, covered: Period[] | undefined): string {
  if (covered && covered.length) return `Covers ${describeCovered(covered)}`;
  if (p.months_count <= 0) return PAYMENT_CATEGORY_LABELS[p.category] ?? "Extra";
  const start = { year: p.payment_year, month: p.payment_month };
  const planned = Array.from({ length: p.months_count }, (_, i) => addMonths(start, i));
  return `${p.payment_status === "paid" ? "Covers" : "For"} ${describeCovered(planned)}`;
}

/**
 * Payment transactions with Void / Restore / Delete.
 * Every change recalculates totals, revenue, balances and statuses everywhere.
 */
export function PaymentHistory({
  payments,
  covered,
  timeZone,
  showMember = false,
  emptyText = "No payments yet.",
}: {
  payments: Payment[];
  /** Months each payment covers (by payment id). */
  covered: Map<string, Period[]>;
  timeZone: string;
  showMember?: boolean;
  emptyText?: string;
}) {
  if (payments.length === 0) return <p className="px-6 py-10 text-center text-sm text-stone-500">{emptyText}</p>;

  return (
    <ul className="divide-y divide-stone-100">
      {payments.map((p) => {
        const isVoid = p.payment_status === "void";
        const canVoid = p.payment_status === "paid" && p.payment_method !== "stripe";
        const extra =
          p.extra_cents > 0 && p.months_count > 0
            ? ` · ${formatMoney(p.extra_cents, p.currency)} ${EXTRA_CATEGORY_LABELS[p.extra_category ?? "donation"].toLowerCase()}`
            : "";
        return (
          <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className={isVoid ? "text-stone-400 line-through" : "font-semibold text-stone-900"}>
                {formatMoney(p.amount_cents, p.currency)}
                {showMember && (
                  <>
                    {" · "}
                    {p.member_id ? (
                      <Link href={`/member-management/${p.member_id}`} className="hover:text-brand-600">
                        {p.member_name}
                      </Link>
                    ) : (
                      p.member_name
                    )}
                  </>
                )}
                <span className="font-normal text-stone-600">
                  {" · "}
                  {coverText(p, covered.get(p.id))}
                  {extra}
                </span>
              </p>
              <p className="text-xs text-stone-500">
                {formatDate(p.payment_date, timeZone)} · {PAYMENT_METHOD_LABELS[p.payment_method]}
                {p.notes && <> · {p.notes}</>}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <PaymentStatusBadge status={p.payment_status} />
              {canVoid && (
                <form action={voidPayment.bind(null, p.id)}>
                  <SubmitButton
                    variant="secondary"
                    size="sm"
                    pendingText="…"
                    confirmMessage={`Void this ${formatMoney(p.amount_cents, p.currency)} payment? It stays in the history but no longer counts in any totals, and the months it covered become unpaid again.`}
                  >
                    <Ban className="h-4 w-4" aria-hidden /> Void
                  </SubmitButton>
                </form>
              )}
              {isVoid && p.payment_method !== "stripe" && (
                <form action={restorePayment.bind(null, p.id)}>
                  <SubmitButton variant="secondary" size="sm" pendingText="…">
                    <RotateCcw className="h-4 w-4" aria-hidden /> Restore
                  </SubmitButton>
                </form>
              )}
              {p.payment_method !== "stripe" && (
                <form action={deletePayment.bind(null, p.id)}>
                  <SubmitButton
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    pendingText="…"
                    confirmMessage={`Permanently delete this ${formatMoney(p.amount_cents, p.currency)} payment? This cannot be undone. All totals will be recalculated.`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete
                  </SubmitButton>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
