import { cn } from "./cn";

const tones = {
  neutral: "text-stone-900",
  green: "text-emerald-600",
  red: "text-red-600",
  amber: "text-amber-600",
  brand: "text-brand-600",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof tones;
  icon?: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 sm:text-sm sm:normal-case sm:tracking-normal">
          {label}
        </p>
        {icon && <span className="text-stone-400">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums sm:text-3xl", tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500 sm:text-sm">{hint}</p>}
    </div>
  );
}
