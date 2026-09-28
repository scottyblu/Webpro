"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { MembershipBadge, StatusBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { formatDate, formatMoney } from "@/lib/format";
import type { MembershipStatus, MonthStatus } from "@/lib/types";

export interface DirectoryRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  joinedDate: string;
  membershipStatus: MembershipStatus;
  monthStatus: MonthStatus;
  totalPaidCents: number;
  autopay: boolean;
}

type Filter = "all" | MembershipStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "cancelled", label: "Cancelled" },
  { value: "inactive", label: "Inactive" },
];

export function MembersDirectory({ rows, currency, monthLabel }: { rows: DirectoryRow[]; currency: string; monthLabel: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.membershipStatus === filter) &&
        (!q || r.fullName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    );
  }, [rows, filter, query]);

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-stone-100 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => {
            const count = f.value === "all" ? rows.length : rows.filter((r) => r.membershipStatus === f.value).length;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
                  filter === f.value ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200",
                )}
              >
                {f.label} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block md:w-72">
          <span className="sr-only">Search members</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="block w-full rounded-lg border-0 py-2 pl-9 pr-3 text-base shadow-sm ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 sm:text-sm"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-stone-500">
          {rows.length === 0 ? "No members yet. Add your first member to get started." : "No members match."}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="px-6 py-3">Member</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Joined</th>
                  <th className="px-3 py-3">Membership</th>
                  <th className="px-3 py-3">{monthLabel}</th>
                  <th className="px-6 py-3 text-right">Total paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-6 py-3">
                      <Link href={`/member-management/${r.id}`} className="font-semibold text-stone-900 hover:text-brand-600">
                        {r.fullName}
                      </Link>
                      <div className="text-xs text-stone-500">{r.email}</div>
                    </td>
                    <td className="px-3 py-3 text-stone-700">{r.phone ?? "—"}</td>
                    <td className="px-3 py-3 text-stone-700">{formatDate(r.joinedDate)}</td>
                    <td className="px-3 py-3">
                      <MembershipBadge status={r.membershipStatus} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.monthStatus} />
                    </td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums">{formatMoney(r.totalPaidCents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-stone-100 md:hidden">
            {visible.map((r) => (
              <li key={r.id}>
                <Link href={`/member-management/${r.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.fullName}</p>
                    <p className="truncate text-xs text-stone-500">{r.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={r.monthStatus} />
                    <MembershipBadge status={r.membershipStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
