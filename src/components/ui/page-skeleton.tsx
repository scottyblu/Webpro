/** Shown instantly while a page loads, so tapping a tab feels immediate. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-stone-200" />
      <div className="mt-2 h-4 w-72 max-w-full rounded bg-stone-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-stone-200/70" />
        ))}
      </div>
      <div className="mt-6 h-72 rounded-xl bg-stone-200/70" />
    </div>
  );
}
