export default function BranchLoading() {
  return (
    <>
      {/* Hero skeleton */}
      <section className="relative min-h-[100svh] overflow-hidden bg-bg-soft">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="container-edge h-full flex items-end pb-24 relative z-10">
          <div className="space-y-6 w-full">
            <div className="h-6 w-32 rounded bg-bg-card animate-pulse" />
            <div className="h-24 md:h-32 w-3/4 max-w-3xl rounded bg-bg-card animate-pulse" />
            <div className="h-5 w-1/2 max-w-xl rounded bg-bg-card animate-pulse" />
            <div className="flex gap-3 pt-4">
              <div className="h-12 w-40 rounded-lg bg-bg-card animate-pulse" />
              <div className="h-12 w-32 rounded-lg bg-bg-card animate-pulse" />
            </div>
          </div>
        </div>
      </section>

      {/* Quick facts skeleton */}
      <section className="border-y border-line bg-bg-soft">
        <div className="container-edge py-6 grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded bg-bg-card animate-pulse" />
          ))}
        </div>
      </section>

      <section className="container-edge py-20 space-y-6">
        <div className="h-4 w-32 rounded bg-bg-card animate-pulse" />
        <div className="h-10 w-2/3 rounded bg-bg-card animate-pulse" />
        <div className="h-4 w-full rounded bg-bg-card animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-bg-card animate-pulse" />
      </section>
    </>
  );
}
