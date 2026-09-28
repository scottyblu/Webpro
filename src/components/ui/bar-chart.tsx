export interface BarDatum {
  label: string;
  value: number;
  /** Optional target (e.g. expected revenue) drawn as a faint bar behind the value. */
  target?: number;
  display: string;
}

/** Minimal dependency-free vertical bar chart. */
export function BarChart({ data, height = 180 }: { data: BarDatum[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.target ?? 0)));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex min-w-full items-end gap-2 sm:gap-3" style={{ height }} role="img" aria-label="Bar chart">
        {data.map((d) => (
          <div key={d.label} className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.display}`}>
            <span className="text-[10px] font-semibold tabular-nums text-stone-600 sm:text-xs">{d.display}</span>
            <div className="relative flex w-full max-w-[48px] items-end justify-center" style={{ height: height - 40 }}>
              {d.target !== undefined && (
                <div
                  className="absolute bottom-0 w-full rounded-t-md bg-stone-200"
                  style={{ height: `${(d.target / max) * 100}%` }}
                />
              )}
              <div
                className="relative w-full rounded-t-md bg-brand-500 transition-all"
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex min-w-full gap-2 sm:gap-3">
        {data.map((d) => (
          <div key={d.label} className="min-w-[28px] flex-1 text-center text-[10px] text-stone-500 sm:text-xs">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal paid vs unpaid progress bar. */
export function PaidProgress({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-stone-700">
          {paid} of {total} paid
        </span>
        <span className="font-semibold text-stone-900">{pct}%</span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-red-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
