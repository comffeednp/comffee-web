export default function AdminLoading() {
  return (
    <div className="container-edge py-12">
      <div className="space-y-4">
        <div className="h-4 w-24 rounded bg-bg-elev animate-pulse" />
        <div className="h-10 w-1/2 max-w-md rounded bg-bg-elev animate-pulse" />
        <div className="h-4 w-2/3 max-w-lg rounded bg-bg-elev animate-pulse" />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl border border-line-bright bg-bg-card animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
