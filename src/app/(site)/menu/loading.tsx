export default function MenuLoading() {
  return (
    <>
      <section className="border-b border-line bg-bg-soft py-20">
        <div className="container-edge space-y-4">
          <div className="h-4 w-24 rounded bg-bg-card animate-pulse" />
          <div className="h-16 md:h-24 w-1/2 rounded bg-bg-card animate-pulse" />
        </div>
      </section>
      <section className="container-edge py-20 space-y-16">
        {[0, 1, 2].map((g) => (
          <div key={g}>
            <div className="h-8 w-48 rounded bg-bg-card animate-pulse mb-8" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-lg border border-line-bright bg-bg-card animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
