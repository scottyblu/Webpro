import Link from "next/link";
import { Check, X } from "lucide-react";
import { confirmPendingPayment, rejectPendingPayment } from "@/app/actions/payments";
import { Card, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { addMonths, periodLabel } from "@/lib/periods";
import type { Payment } from "@/lib/types";

/** "for October 2026" · "for Oct 2026 – Sep 2027 (12 months)" · "(donation / extra)" */
export function pendingCovers(p: Payment): string {
  const start = { year: p.payment_year, month: p.payment_month };
  if (p.months_count <= 0) return "(donation / extra)";
  const extra = p.extra_cents > 0 ? ` + ${formatMoney(p.extra_cents, p.currency)} extra` : "";
  if (p.months_count === 1) return `for ${periodLabel(start)}${extra}`;
  return `for ${periodLabel(start)} – ${periodLabel(addMonths(start, p.months_count - 1))} (${p.months_count} months)${extra}`;
}

/** Member-reported payments (e.g. "I've sent my Zelle payment") waiting for the admin to check the bank. */
export function PendingPayments({ payments, timeZone }: { payments: Payment[]; timeZone: string }) {
  if (payments.length === 0) return null;
  return (
    <Card className="border-amber-300 ring-1 ring-amber-200">
      <CardHeader
        title={`Waiting for confirmation (${payments.length})`}
        description="Members say they've sent these. Check your bank, then confirm or reject."
      />
      <ul className="divide-y divide-stone-100">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="font-semibold text-stone-900">
                {p.member_id ? (
                  <Link href={`/member-management/${p.member_id}`} className="hover:text-brand-600">
                    {p.member_name}
                  </Link>
                ) : (
                  p.member_name
                )}{" "}
                <span className="font-normal text-stone-600">
                  — {formatMoney(p.amount_cents, p.currency)} {PAYMENT_METHOD_LABELS[p.payment_method]}{" "}
                  {pendingCovers(p)}
                </span>
              </p>
              <p className="text-xs text-stone-500">
                Reported {formatDate(p.created_at, timeZone)}
                {p.notes && <> · {p.notes}</>}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <form action={confirmPendingPayment.bind(null, p.id)} className="flex-1 sm:flex-none">
                <SubmitButton variant="success" size="sm" className="w-full whitespace-nowrap" pendingText="Confirming…">
                  <Check className="h-4 w-4" aria-hidden /> Received
                </SubmitButton>
              </form>
              <form action={rejectPendingPayment.bind(null, p.id)} className="flex-1 sm:flex-none">
                <SubmitButton
                  variant="secondary"
                  size="sm"
                  className="w-full whitespace-nowrap"
                  pendingText="…"
                  confirmMessage={`Reject ${p.member_name}'s payment? Use this only if the money never arrived. It stays in the history as voided.`}
                >
                  <X className="h-4 w-4" aria-hidden /> Not received
                </SubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
