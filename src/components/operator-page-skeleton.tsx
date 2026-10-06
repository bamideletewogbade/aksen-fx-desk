/** A stable page shape while authentication, route code, or data is loading. */
export function OperatorPageSkeleton({ label = 'page' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={`Loading ${label}`} className="space-y-6">
      <span className="sr-only">Loading {label}…</span>
      <div className="space-y-3">
        <div className="h-3 w-24 animate-pulse rounded bg-[#e9efe7]" />
        <div className="h-8 w-48 max-w-full animate-pulse rounded-lg bg-[#e9efe7]" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-[#e9efe7]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((n) => <div key={n} className="h-24 animate-pulse rounded-2xl border border-line bg-white p-4"><div className="h-3 w-20 rounded bg-[#e9efe7]" /><div className="mt-4 h-6 w-2/3 rounded bg-[#e9efe7]" /></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <div className="h-4 w-32 animate-pulse rounded bg-[#e9efe7]" />
          {[0, 1, 2, 3].map((n) => <div key={n} className="h-14 animate-pulse rounded-xl bg-[#f3f6f2]" />)}
        </div>
        <div className="h-52 animate-pulse rounded-2xl border border-line bg-white" />
      </div>
    </div>
  );
}
