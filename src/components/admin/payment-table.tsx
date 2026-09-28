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
import type { MonthStatus } from "@/lib/types";

type Filter = "ALL" | MonthStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PAID", label: "Paid" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PENDING", label: "Pending" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function PaymentTable({
  rows,
  currency,
  period,
  timeZone,
  initialFilter = "ALL",
}: {
  rows: MemberMonthRow[];
  currency: string;
  /** "YYYY-MM" of the month being shown (used for the "Mark paid" shortcut). */
  period: string;
  timeZone: string;
  initialFilter?: Filter;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: rows.length, PAID: 0, UNPAID: 0, PENDING: 0, CANCELLED: 0 };
    rows.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (filter === "ALL" || r.status === filter) && (!q || r.fullName.toLowerCase().includes(q)));
  }, [rows, filter, query]);

  const profileHref = (id: string) => `/member-management/${id}`;
  const markPaidHref = (id: string) => `/member-management/${id}?record=${period}#record-payment`;

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
          {rows.length === 0 ? "No members yet." : "No members match this filter."}
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
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">Payment date</th>
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
                    className="cursor-pointer hover:bg-stone-50"
                  >
                    <td className="px-6 py-3">
                      <Link href={profileHref(r.memberId)} className="font-semibold text-stone-900 hover:text-brand-600" onClick={(e) => e.stopPropagation()}>
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
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(r.amountCents, currency)}</td>
                    <td className="px-3 py-3 text-stone-700">
                      {r.paymentDate ? formatDate(r.paymentDate, timeZone) : "—"}
                      {r.paymentMethod && r.status === "PAID" && (
                        <span className="ml-1.5 text-xs text-stone-500">· {PAYMENT_METHOD_LABELS[r.paymentMethod]}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-stone-700">{formatDate(r.nextDueDate)}</td>
                    <td className="px-6 py-3 text-right">
                      {(r.status === "UNPAID" || r.status === "PENDING") && (
                        <Link
                          href={markPaidHref(r.memberId)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/30 hover:bg-emerald-50"
                        >
                          Mark paid
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-stone-100 md:hidden">
            {visible.map((r) => (
              <li key={r.memberId} className="flex items-center gap-3 px-4 py-3">
                <Link href={profileHref(r.memberId)} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-stone-900">{r.fullName}</p>
                  <p className="text-xs text-stone-500">
                    {r.status === "PAID"
                      ? `${formatMoney(r.amountCents, currency)} · ${formatDate(r.paymentDate, timeZone)}`
                      : `Next due ${formatDate(r.nextDueDate)}`}
                    {r.lastAttemptFailed && <span className="ml-1 font-medium text-red-600">· Card failed</span>}
                  </p>
                </Link>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={r.status} />
                  {(r.status === "UNPAID" || r.status === "PENDING") && (
                    <Link href={markPaidHref(r.memberId)} className="text-xs font-semibold text-emerald-700">
                      Mark paid
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
