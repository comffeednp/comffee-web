export default function BranchesLoading() {
  return (
    <>
      <section className="border-b border-line bg-bg-soft py-20">
        <div className="container-edge space-y-4">
          <div className="h-4 w-24 rounded bg-bg-card animate-pulse" />
          <div className="h-16 md:h-24 w-3/4 max-w-3xl rounded bg-bg-card animate-pulse" />
          <div className="h-5 w-1/2 rounded bg-bg-card animate-pulse" />
        </div>
      </section>
      <section className="container-edge py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-xl border border-line-bright bg-bg-card animate-pulse"
            />
          ))}
        </div>
      </section>
    </>
  );
}
