"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import type { MemberMonthRow } from "@/lib/billing";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { periodShortLabel } from "@/lib/periods";
import type { MonthStatus } from "@/lib/types";
import { QuickPay, UndoPayment } from "./quick-pay";

type Filter = "ALL" | MonthStatus | "OWES";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PAID", label: "Paid" },
  { value: "PAID_AHEAD", label: "Paid ahead" },
  { value: "OWES", label: "Owes money" },
  { value: "PENDING", label: "Pending" },
  { value: "CANCELLED", label: "Cancelled" },
];

const isPaid = (r: MemberMonthRow) => r.status === "PAID" || r.status === "PAID_AHEAD";
const needsPayment = (r: MemberMonthRow) => r.status === "UNPAID" || r.status === "OVERDUE" || r.status === "PENDING";

/** "$20 · Sep 3 · Zelle" plus "part of a $240 payment (12 months)" for prepayments. */
function paidDetail(r: MemberMonthRow, currency: string, timeZone: string): string {
  const parts = [formatDate(r.paymentDate, timeZone)];
  if (r.paymentMethod) parts.push(PAYMENT_METHOD_LABELS[r.paymentMethod]);
  if (r.paymentMonths > 1 || r.paymentAmountCents > r.amountCents) {
    parts.push(
      `part of ${formatMoney(r.paymentAmountCents, currency)} payment${r.paymentMonths > 1 ? ` (${r.paymentMonths} months)` : ""}`,
    );
  }
  if (r.paidThrough && r.prepaidMonths > 0) parts.push(`paid through ${periodShortLabel(r.paidThrough)}`);
  return parts.join(" · ");
}

/** "$40 · Aug, Sep" style summary of what a member still owes. */
function OwedCell({ row, currency, compact = false }: { row: MemberMonthRow; currency: string; compact?: boolean }) {
  if (row.owedCents <= 0) {
    return <span className={cn("font-medium text-emerald-700", compact && "text-xs")}>Up to date</span>;
  }
  const months = row.owedMonths.map((p) => periodShortLabel(p));
  const shown = months.length > 3 ? `${months.slice(0, 3).join(", ")} +${months.length - 3} more` : months.join(", ");
  return (
    <span className={cn(compact && "text-xs")}>
      <span className="font-bold text-red-700 tabular-nums">{formatMoney(row.owedCents, currency)}</span>
      <span className="block text-xs text-stone-500">
        {row.owedMonths.length} month{row.owedMonths.length === 1 ? "" : "s"}: {shown}
      </span>
    </span>
  );
}

export function PaymentTable({
  rows,
  currency,
  period,
  timeZone,
  initialFilter = "ALL",
}: {
  rows: MemberMonthRow[];
  currency: string;
  /** "YYYY-MM" of the month being shown (what the Paid button records). */
  period: string;
  timeZone: string;
  initialFilter?: Filter;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      ALL: rows.length,
      PAID: 0,
      PAID_AHEAD: 0,
      UNPAID: 0,
      OVERDUE: 0,
      PENDING: 0,
      CANCELLED: 0,
      OWES: 0,
    };
    rows.forEach((r) => {
      c[r.status]++;
      if (r.owedCents > 0) c.OWES++;
    });
    // "Unpaid" includes overdue members; "Paid" includes members paid ahead.
    c.UNPAID += c.OVERDUE;
    c.PAID += c.PAID_AHEAD;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          (filter === "ALL" ||
            (filter === "OWES"
              ? r.owedCents > 0
              : filter === "UNPAID"
                ? r.status === "UNPAID" || r.status === "OVERDUE"
                : filter === "PAID"
                  ? isPaid(r)
                  : r.status === filter)) &&
          (!q || r.fullName.toLowerCase().includes(q)),
      )
      .sort((a, b) => (filter === "OWES" ? b.owedCents - a.owedCents : 0));
  }, [rows, filter, query]);

  const profileHref = (id: string) => `/member-management/${id}`;

  const action = (r: MemberMonthRow) =>
    needsPayment(r) ? (
      <QuickPay memberId={r.memberId} memberName={r.fullName} period={period} fee={formatMoney(r.duesCents, currency)} />
    ) : isPaid(r) && r.manualPaymentId ? (
      <UndoPayment paymentId={r.manualPaymentId} memberName={r.fullName} />
    ) : null;

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-stone-100 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:pb-0" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.value ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  filter === f.value ? "bg-white/20" : "bg-white text-stone-500",
                )}
              >
                {counts[f.value]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative block md:w-72">
          <span className="sr-only">Search members by name</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="block w-full rounded-lg border-0 py-2 pl-9 pr-3 text-base shadow-sm ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 sm:text-sm"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-stone-500">
          {rows.length === 0 ? "No members yet." : filter === "OWES" ? "Nobody owes anything. 🎉" : "No members match this filter."}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Paid</th>
                  <th className="px-3 py-3">Owes (all months)</th>
                  <th className="px-3 py-3">Next due</th>
                  <th className="px-6 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map((r) => (
                  <tr
                    key={r.memberId}
                    onClick={() => router.push(profileHref(r.memberId))}
                    className="cursor-pointer align-top hover:bg-stone-50"
                  >
                    <td className="px-6 py-3">
                      <Link
                        href={profileHref(r.memberId)}
                        className="font-semibold text-stone-900 hover:text-brand-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.fullName}
                      </Link>
                      <div className="text-xs text-stone-500">
                        {r.autopay ? "Auto-pay" : "Manual"}
                        {r.lastAttemptFailed && <span className="ml-2 font-medium text-red-600">Card failed</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      {isPaid(r) ? (
                        <>
                          <span className="font-semibold tabular-nums">{formatMoney(r.amountCents, currency)}</span>
                          <span className="block text-xs text-stone-500">{paidDetail(r, currency, timeZone)}</span>
                        </>
                      ) : r.status === "PENDING" && r.paymentMethod ? (
                        <span className="text-xs text-amber-700">
                          {PAYMENT_METHOD_LABELS[r.paymentMethod]} reported {formatDate(r.paymentDate, timeZone)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <OwedCell row={r} currency={currency} />
                    </td>
                    <td className="px-3 py-3 text-stone-700">{formatDate(r.nextDueDate)}</td>
                    <td className="px-6 py-3 text-right">{action(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-stone-100 md:hidden">
            {visible.map((r) => (
              <li key={r.memberId} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Link href={profileHref(r.memberId)} className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-stone-900">{r.fullName}</p>
                    <p className="text-xs text-stone-500">
                      {isPaid(r)
                        ? `${formatMoney(r.amountCents, currency)} · ${paidDetail(r, currency, timeZone)}`
                        : `Due ${formatDate(r.dueDate)}`}
                      {r.lastAttemptFailed && <span className="ml-1 font-medium text-red-600">· Card failed</span>}
                    </p>
                    <div className="mt-1">
                      <OwedCell row={r} currency={currency} compact />
                    </div>
                  </Link>
                  <StatusBadge status={r.status} />
                </div>
                {action(r) && <div className="mt-2 flex justify-end">{action(r)}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
