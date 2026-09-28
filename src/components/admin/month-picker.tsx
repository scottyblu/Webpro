"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MonthPicker({ options, value }: { options: { key: string; label: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = options.findIndex((o) => o.key === value);

  const go = (key: string | undefined) => {
    if (!key) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", key);
    router.push(`${pathname}?${params.toString()}`);
  };

  // options are newest first
  const newer = index > 0 ? options[index - 1]?.key : undefined;
  const older = index >= 0 && index < options.length - 1 ? options[index + 1]?.key : undefined;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => go(older)}
        disabled={!older}
        className="rounded-lg p-2 text-stone-600 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <label className="sr-only" htmlFor="month-picker">
        Month
      </label>
      <select
        id="month-picker"
        value={value}
        onChange={(e) => go(e.target.value)}
        className="rounded-lg border-0 bg-white py-2 pl-3 pr-8 text-base font-semibold shadow-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-brand-500 sm:text-sm"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => go(newer)}
        disabled={!newer}
        className="rounded-lg p-2 text-stone-600 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
        aria-label="Next month"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
